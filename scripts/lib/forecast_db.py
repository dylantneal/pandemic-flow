"""Supabase I/O for baseline forecasting."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from supabase import Client

from scripts.lib.config import BATCH_SIZE, IngestionConfig
from scripts.lib.forecast_baselines import (
    ForecastPoint,
    ResidualStats,
    WeeklySeriesPoint,
    compute_residual_stats,
)
from scripts.lib.supabase_client import create_service_client, upsert_batch

logger = logging.getLogger(__name__)

# Region targets for Phase 6
REGIONS: list[tuple[str, str, str]] = [
    ("state", "IL", "Illinois"),
    ("county", "17031", "Cook County, IL"),
]

MODEL_NAMES = {
    "persistence": "persistence_v1",
    "moving_average": "moving_average_v1",
    "trend": "trend_v1",
    "seasonal_naive": "seasonal_naive_v1",
    "ensemble": "ensemble_v1",
}


def fetch_model_run_ids(client: Client) -> dict[str, str]:
    """Return model_name -> id for seeded baseline runs."""
    response = (
        client.table("model_runs")
        .select("id, model_name, model_type, metrics")
        .eq("status", "production")
        .execute()
    )
    return {row["model_name"]: row["id"] for row in (response.data or [])}


def fetch_model_runs_with_metrics(client: Client) -> list[dict[str, Any]]:
    response = (
        client.table("model_runs")
        .select("id, model_name, model_type, version, status, metrics, hyperparameters, updated_at")
        .order("model_name")
        .execute()
    )
    return response.data or []


def fetch_region_history(
    client: Client,
    region_type: str,
    region_id: str,
) -> list[WeeklySeriesPoint]:
    """Fetch full weekly region history with non-null weighted_activity_index."""
    all_rows: list[dict[str, Any]] = []
    page_size = 1000
    offset = 0
    while True:
        response = (
            client.table("weekly_region_metrics")
            .select("week_start, weighted_activity_index")
            .eq("region_type", region_type)
            .eq("region_id", region_id)
            .not_.is_("weighted_activity_index", "null")
            .order("week_start", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    return [
        WeeklySeriesPoint(
            week_start=date.fromisoformat(str(r["week_start"])[:10]),
            value=float(r["weighted_activity_index"]),
        )
        for r in all_rows
    ]


def load_residual_stats_from_metrics(metrics: dict[str, Any]) -> ResidualStats:
    """Parse residual_sigma_by_horizon from model_runs.metrics JSON."""
    raw = metrics.get("residual_sigma_by_horizon") or {}
    by_horizon = {int(k): float(v) for k, v in raw.items()}
    return ResidualStats(by_horizon=by_horizon)


def forecast_point_to_row(
    model_run_id: str,
    entity_type: str,
    entity_id: str,
    origin_week: date,
    fp: ForecastPoint,
) -> dict[str, Any]:
    return {
        "model_run_id": model_run_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "forecast_origin_week": origin_week.isoformat(),
        "target_date": fp.target_date.isoformat(),
        "horizon_weeks": fp.horizon_weeks,
        "predicted_activity_index": fp.predicted_activity_index,
        "lower_bound": fp.lower_bound,
        "upper_bound": fp.upper_bound,
        "predicted_trend": fp.predicted_trend,
        "confidence_label": fp.confidence_label,
    }


def upsert_predictions(client: Client, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        upsert_batch(
            client,
            "predictions",
            batch,
            on_conflict="model_run_id,entity_type,entity_id,forecast_origin_week,horizon_weeks",
        )
        total += len(batch)
        logger.info("Upserted %d predictions (total %d)", len(batch), total)
    return total


def fetch_unscored_predictions(client: Client) -> list[dict[str, Any]]:
    """Predictions whose target_date has actuals but no prediction_actuals row."""
    all_preds: list[dict[str, Any]] = []
    page_size = 1000
    offset = 0
    while True:
        response = (
            client.table("predictions")
            .select(
                "id, model_run_id, entity_type, entity_id, target_date, "
                "horizon_weeks, predicted_activity_index, predicted_trend, forecast_origin_week"
            )
            .order("target_date", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        all_preds.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    if not all_preds:
        return []

    pred_ids = [p["id"] for p in all_preds]
    scored_ids: set[str] = set()
    lookup_chunk = 150
    for i in range(0, len(pred_ids), lookup_chunk):
        chunk = pred_ids[i : i + lookup_chunk]
        scored = (
            client.table("prediction_actuals")
            .select("prediction_id")
            .in_("prediction_id", chunk)
            .execute()
        )
        scored_ids.update(r["prediction_id"] for r in (scored.data or []))

    # Build actual lookup: (entity_type, entity_id, week_start) -> value
    actuals_map = _fetch_all_region_actuals(client)

    unscored: list[dict[str, Any]] = []
    for pred in all_preds:
        if pred["id"] in scored_ids:
            continue
        key = (
            pred["entity_type"],
            pred["entity_id"],
            str(pred["target_date"])[:10],
        )
        if key in actuals_map:
            pred["_actual"] = actuals_map[key]
            unscored.append(pred)
    return unscored


def _fetch_all_region_actuals(client: Client) -> dict[tuple[str, str, str], float]:
    result: dict[tuple[str, str, str], float] = {}
    for region_type, region_id, _ in REGIONS:
        history = fetch_region_history(client, region_type, region_id)
        for pt in history:
            result[(region_type, region_id, pt.week_start.isoformat())] = pt.value
    return result


def insert_prediction_actuals(
    client: Client,
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        client.table("prediction_actuals").upsert(
            batch,
            on_conflict="prediction_id",
        ).execute()
    return len(rows)


def update_model_run_metrics(
    client: Client,
    model_run_id: str,
    metrics: dict[str, Any],
) -> None:
    client.table("model_runs").update({"metrics": metrics}).eq("id", model_run_id).execute()


def compute_and_store_metrics(
    client: Client,
    model_run_id: str,
) -> dict[str, Any]:
    """Recompute evaluation metrics for a model run from prediction_actuals join."""
    preds_response = (
        client.table("predictions")
        .select("id, horizon_weeks, entity_type, entity_id")
        .eq("model_run_id", model_run_id)
        .execute()
    )
    preds = preds_response.data or []
    if not preds:
        return {}

    pred_ids = [p["id"] for p in preds]
    actuals: list[dict[str, Any]] = []
    lookup_chunk = 150
    for i in range(0, len(pred_ids), lookup_chunk):
        chunk = pred_ids[i : i + lookup_chunk]
        resp = (
            client.table("prediction_actuals")
            .select("prediction_id, absolute_error, squared_error, trend_correct")
            .in_("prediction_id", chunk)
            .execute()
        )
        actuals.extend(resp.data or [])

    if not actuals:
        return {}

    pred_horizon = {p["id"]: p["horizon_weeks"] for p in preds}
    by_horizon: dict[int, list[dict[str, Any]]] = {}
    for a in actuals:
        h = pred_horizon.get(a["prediction_id"])
        if h is None:
            continue
        by_horizon.setdefault(h, []).append(a)

    import statistics

    metrics: dict[str, Any] = {"by_horizon": {}, "residual_sigma_by_horizon": {}}
    errors_by_horizon: dict[int, list[float]] = {}

    for h, group in sorted(by_horizon.items()):
        abs_errors = [float(g["absolute_error"]) for g in group]
        sq_errors = [float(g["squared_error"]) for g in group]
        trend_correct = [g["trend_correct"] for g in group if g["trend_correct"] is not None]
        mae = statistics.mean(abs_errors) if abs_errors else None
        rmse = (statistics.mean(sq_errors) ** 0.5) if sq_errors else None
        trend_acc = (
            sum(1 for t in trend_correct if t) / len(trend_correct) if trend_correct else None
        )
        metrics["by_horizon"][str(h)] = {
            "mae": round(mae, 4) if mae is not None else None,
            "rmse": round(rmse, 4) if rmse is not None else None,
            "trend_accuracy": round(trend_acc, 4) if trend_acc is not None else None,
            "n_evaluations": len(group),
        }
        errors_by_horizon[h] = abs_errors

    residual = compute_residual_stats(errors_by_horizon)
    metrics["residual_sigma_by_horizon"] = {
        str(k): round(v, 4) for k, v in residual.by_horizon.items()
    }
    metrics["total_evaluations"] = len(actuals)

    update_model_run_metrics(client, model_run_id, metrics)
    return metrics


def create_client_from_config(config: IngestionConfig | None = None) -> Client:
    from scripts.lib.config import load_config

    cfg = config or load_config()
    return create_service_client(cfg)
