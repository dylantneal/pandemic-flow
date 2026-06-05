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
    *,
    with_covariates: bool = False,
) -> list[WeeklySeriesPoint]:
    """Fetch full weekly region history with non-null weighted_activity_index."""
    columns = "week_start, weighted_activity_index"
    if with_covariates:
        columns += (
            ", quality_score, active_site_count, population_represented,"
            " week_over_week_change"
        )
    all_rows: list[dict[str, Any]] = []
    page_size = 1000
    offset = 0
    while True:
        response = (
            client.table("weekly_region_metrics")
            .select(columns)
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

    points: list[WeeklySeriesPoint] = []
    for r in all_rows:
        pt = WeeklySeriesPoint(
            week_start=date.fromisoformat(str(r["week_start"])[:10]),
            value=float(r["weighted_activity_index"]),
        )
        if with_covariates:
            pt = WeeklySeriesPoint(
                week_start=pt.week_start,
                value=pt.value,
                quality_score=(
                    float(r["quality_score"]) if r.get("quality_score") is not None else None
                ),
                active_site_count=(
                    float(r["active_site_count"])
                    if r.get("active_site_count") is not None
                    else None
                ),
                population_represented=(
                    float(r["population_represented"])
                    if r.get("population_represented") is not None
                    else None
                ),
                week_over_week_change=(
                    float(r["week_over_week_change"])
                    if r.get("week_over_week_change") is not None
                    else None
                ),
            )
        points.append(pt)
    return points


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


def _filter_scorable_predictions(
    all_preds: list[dict[str, Any]],
    scored_ids: set[str],
    actuals_map: dict[tuple[str, str, str], float],
    *,
    include_scored: bool,
) -> list[dict[str, Any]]:
    """Keep predictions with known actuals; optionally skip already-scored rows."""
    scorable: list[dict[str, Any]] = []
    for pred in all_preds:
        if not include_scored and pred["id"] in scored_ids:
            continue
        key = (
            pred["entity_type"],
            pred["entity_id"],
            str(pred["target_date"])[:10],
        )
        if key not in actuals_map:
            continue
        pred["_actual"] = actuals_map[key]
        scorable.append(pred)
    return scorable


def fetch_scorable_predictions(
    client: Client,
    *,
    model_run_ids: list[str] | None = None,
    include_scored: bool = False,
) -> list[dict[str, Any]]:
    """
    Predictions whose target_date has actuals in weekly_region_metrics.

    When include_scored is False (default), skip rows that already have
    prediction_actuals. Set include_scored=True to refresh errors after
    inference upserts the same model_run/origin/horizon key.
    """
    all_preds: list[dict[str, Any]] = []
    page_size = 1000
    offset = 0
    select_cols = (
        "id, model_run_id, entity_type, entity_id, target_date, "
        "horizon_weeks, predicted_activity_index, predicted_trend, "
        "forecast_origin_week, lower_bound, upper_bound"
    )
    while True:
        query = (
            client.table("predictions")
            .select(select_cols)
            .order("target_date", desc=False)
        )
        if model_run_ids:
            query = query.in_("model_run_id", model_run_ids)
        response = query.range(offset, offset + page_size - 1).execute()
        batch = response.data or []
        if not batch:
            break
        all_preds.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    if not all_preds:
        return []

    scored_ids: set[str] = set()
    if not include_scored:
        pred_ids = [p["id"] for p in all_preds]
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

    actuals_map = _fetch_all_region_actuals(client)
    return _filter_scorable_predictions(
        all_preds,
        scored_ids,
        actuals_map,
        include_scored=include_scored,
    )


def fetch_unscored_predictions(client: Client) -> list[dict[str, Any]]:
    """Predictions whose target_date has actuals but no prediction_actuals row."""
    return fetch_scorable_predictions(client, include_scored=False)


def fetch_neural_ode_model_run_ids(client: Client, version: str) -> list[str]:
    """model_runs.id values for neural_ode candidates at a version."""
    response = (
        client.table("model_runs")
        .select("id")
        .eq("model_type", "neural_ode")
        .eq("version", version)
        .execute()
    )
    return [str(row["id"]) for row in (response.data or [])]


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

    def _upsert_resilient(batch: list[dict[str, Any]]) -> int:
        if not batch:
            return 0
        try:
            upsert_batch(
                client,
                "prediction_actuals",
                batch,
                on_conflict="prediction_id",
            )
            return len(batch)
        except Exception as exc:  # noqa: BLE001
            # Some large upserts intermittently 500 via PostgREST. Split and retry.
            if len(batch) == 1:
                pred_id = batch[0].get("prediction_id")
                logger.error(
                    "Failed to upsert prediction_actuals row for prediction_id=%s: %s",
                    pred_id,
                    exc,
                )
                return 0
            mid = len(batch) // 2
            left = _upsert_resilient(batch[:mid])
            right = _upsert_resilient(batch[mid:])
            return left + right

    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        inserted += _upsert_resilient(batch)
    return inserted


def update_model_run_metrics(
    client: Client,
    model_run_id: str,
    metrics: dict[str, Any],
) -> None:
    client.table("model_runs").update({"metrics": metrics}).eq("id", model_run_id).execute()


def merge_model_run_metrics(
    client: Client,
    model_run_id: str,
    patch: dict[str, Any],
) -> dict[str, Any]:
    """Shallow-merge patch into existing model_runs.metrics and persist."""
    response = (
        client.table("model_runs")
        .select("metrics")
        .eq("id", model_run_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    current = dict(rows[0].get("metrics") or {}) if rows else {}
    merged = {**current, **patch}
    if rows:
        update_model_run_metrics(client, model_run_id, merged)
    return merged


def holdout_origin_weeks_for_region(
    client: Client,
    entity_type: str,
    entity_id: str,
    *,
    holdout_weeks: int = 16,
) -> frozenset[str]:
    """ISO week_start strings for the training holdout slice (promotion parity)."""
    from scripts.lib.neural_ode.dataset import DEFAULT_HOLDOUT_WEEKS, compute_series_split

    history = fetch_region_history(client, entity_type, entity_id)
    if not history:
        return frozenset()
    weeks = holdout_weeks or DEFAULT_HOLDOUT_WEEKS
    split = compute_series_split(len(history), holdout_weeks=weeks)
    return frozenset(history[i].week_start.isoformat() for i in split.holdout_indices)


def _fetch_region_origin_context(
    client: Client,
) -> dict[tuple[str, str, str], dict[str, float | None]]:
    """Lookup origin-week context for regime and quality segmentation."""
    from scripts.lib.neural_ode.metrics import (
        origin_regime_from_change,
        quality_segment_from_score,
    )

    context: dict[tuple[str, str, str], dict[str, float | None]] = {}
    for region_type, region_id, _ in REGIONS:
        history = fetch_region_history(
            client,
            region_type,
            region_id,
            with_covariates=True,
        )
        for pt in history:
            key = (region_type, region_id, pt.week_start.isoformat())
            wow = pt.week_over_week_change
            quality = pt.quality_score
            context[key] = {
                "week_over_week_change": wow,
                "quality_score": quality,
                "_origin_regime": origin_regime_from_change(wow),
                "_quality_segment": quality_segment_from_score(quality),
            }
    return context


def _enrich_actual_rows_for_metrics(
    client: Client,
    preds: list[dict[str, Any]],
    actuals: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Attach interval bounds and origin regime/quality context for metric aggregation."""
    if not actuals:
        return []

    pred_by_id = {str(p["id"]): p for p in preds}
    origin_context = _fetch_region_origin_context(client)
    enriched: list[dict[str, Any]] = []

    for row in actuals:
        payload = dict(row)
        pred = pred_by_id.get(str(row.get("prediction_id", "")))
        if pred:
            payload["_lower_bound"] = pred.get("lower_bound")
            payload["_upper_bound"] = pred.get("upper_bound")
            origin_key = (
                pred.get("entity_type"),
                pred.get("entity_id"),
                str(pred.get("forecast_origin_week", ""))[:10],
            )
            ctx = origin_context.get(origin_key, {})
            payload["_origin_regime"] = ctx.get("_origin_regime", "unknown")
            payload["_quality_segment"] = ctx.get("_quality_segment", "unknown")
        enriched.append(payload)
    return enriched


def _fetch_scored_actuals_for_predictions(
    client: Client,
    preds: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Return actuals rows and prediction_id -> horizon_weeks map."""
    if not preds:
        return [], {}
    pred_horizon = {p["id"]: int(p["horizon_weeks"]) for p in preds}
    pred_ids = list(pred_horizon.keys())
    actuals: list[dict[str, Any]] = []
    lookup_chunk = 150
    for i in range(0, len(pred_ids), lookup_chunk):
        chunk = pred_ids[i : i + lookup_chunk]
        resp = (
            client.table("prediction_actuals")
            .select(
                "prediction_id, actual_activity_index, absolute_error, "
                "squared_error, trend_correct"
            )
            .in_("prediction_id", chunk)
            .execute()
        )
        actuals.extend(resp.data or [])
    return actuals, pred_horizon


def _filter_errors_for_region_slice(
    errors: dict[tuple[str, str, str, int], float],
    entity_type: str,
    entity_id: str,
    origin_weeks: frozenset[str] | None,
) -> dict[tuple[str, str, str, int], float]:
    if not origin_weeks:
        return errors
    return {
        key: value
        for key, value in errors.items()
        if key[0] == entity_type
        and key[1] == entity_id
        and key[2] in origin_weeks
    }


def compute_model_run_region_metrics(
    client: Client,
    model_run_id: str,
    entity_type: str,
    entity_id: str,
    *,
    origin_weeks: frozenset[str] | None = None,
    store: bool = False,
    model_run_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Metrics for one model run scoped to a region (and optional holdout origin weeks).
    Used for promotion parity: candidate vs baselines on the same evaluation slice.
    """
    from scripts.lib.neural_ode.metrics import aggregate_prediction_actuals

    preds_response = (
        client.table("predictions")
        .select(
            "id, horizon_weeks, entity_type, entity_id, forecast_origin_week, "
            "lower_bound, upper_bound, predicted_activity_index"
        )
        .eq("model_run_id", model_run_id)
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .execute()
    )
    preds = preds_response.data or []
    if origin_weeks:
        preds = [
            p
            for p in preds
            if str(p.get("forecast_origin_week", ""))[:10] in origin_weeks
        ]
    actuals, pred_horizon = _fetch_scored_actuals_for_predictions(client, preds)
    enriched = _enrich_actual_rows_for_metrics(client, preds, actuals)
    metrics = aggregate_prediction_actuals(enriched, pred_horizon=pred_horizon)

    if not model_run_row:
        run_resp = (
            client.table("model_runs")
            .select("model_type, metrics")
            .eq("id", model_run_id)
            .limit(1)
            .execute()
        )
        rows = run_resp.data or []
        model_run_row = rows[0] if rows else {}

    if model_run_row.get("model_type") == "neural_ode" and metrics:
        existing = dict(model_run_row.get("metrics") or {})
        gates = existing.get("correction_gates_by_horizon")
        if gates:
            metrics["correction_gates_by_horizon"] = gates
        ensemble_run_id = fetch_model_run_ids(client).get(MODEL_NAMES["ensemble"])
        if ensemble_run_id and ensemble_run_id != model_run_id:
            candidate_errors = _filter_errors_for_region_slice(
                fetch_prediction_errors_by_origin(client, model_run_id),
                entity_type,
                entity_id,
                origin_weeks,
            )
            ensemble_errors = _filter_errors_for_region_slice(
                fetch_prediction_errors_by_origin(client, ensemble_run_id),
                entity_type,
                entity_id,
                origin_weeks,
            )
            from scripts.lib.neural_ode.metrics import aggregate_improvement_vs_ensemble

            improvement = aggregate_improvement_vs_ensemble(
                candidate_errors, ensemble_errors
            )
            if improvement:
                metrics["improvement_vs_ensemble"] = improvement

    if store and metrics:
        update_model_run_metrics(client, model_run_id, metrics)
    return metrics


def fetch_prediction_errors_by_origin(
    client: Client,
    model_run_id: str,
) -> dict[tuple[str, str, str, int], float]:
    """Map (entity_type, entity_id, origin_week, horizon) -> absolute_error."""
    preds_response = (
        client.table("predictions")
        .select(
            "id, entity_type, entity_id, forecast_origin_week, horizon_weeks"
        )
        .eq("model_run_id", model_run_id)
        .execute()
    )
    preds = preds_response.data or []
    if not preds:
        return {}
    actuals, _ = _fetch_scored_actuals_for_predictions(client, preds)
    err_by_pred = {str(a["prediction_id"]): float(a["absolute_error"]) for a in actuals}
    out: dict[tuple[str, str, str, int], float] = {}
    for pred in preds:
        pid = str(pred["id"])
        if pid not in err_by_pred:
            continue
        key = (
            str(pred["entity_type"]),
            str(pred["entity_id"]),
            str(pred.get("forecast_origin_week", ""))[:10],
            int(pred["horizon_weeks"]),
        )
        out[key] = err_by_pred[pid]
    return out


def _enrich_neural_ode_metrics(
    client: Client,
    model_run_id: str,
    metrics: dict[str, Any],
    preds: list[dict[str, Any]],
    enriched_actuals: list[dict[str, Any]],
    pred_horizon: dict[str, int],
) -> dict[str, Any]:
    """Attach interval recalibration and improvement-vs-ensemble for Neural ODE runs."""
    from scripts.lib.neural_ode.metrics import (
        aggregate_improvement_vs_ensemble,
        projected_interval_coverage,
        recalibrate_residual_sigma_by_horizon,
    )

    errors_by_horizon: dict[int, list[float]] = {}
    for row in enriched_actuals:
        pred_id = row.get("prediction_id")
        h = pred_horizon.get(str(pred_id)) if pred_id else row.get("horizon_weeks")
        if h is None:
            continue
        errors_by_horizon.setdefault(int(h), []).append(float(row["absolute_error"]))

    if errors_by_horizon:
        raw_sigmas = dict(metrics.get("residual_sigma_by_horizon") or {})
        calibrated, calibration_diag = recalibrate_residual_sigma_by_horizon(
            errors_by_horizon
        )
        if calibrated:
            metrics["residual_sigma_by_horizon_raw"] = raw_sigmas
            metrics["residual_sigma_by_horizon"] = calibrated
            metrics["interval_calibration"] = calibration_diag
            actuals_by_pred = {
                str(r["prediction_id"]): r for r in enriched_actuals
            }
            projected = projected_interval_coverage(
                preds,
                actuals_by_pred,
                pred_horizon=pred_horizon,
                sigma_by_horizon=calibrated,
            )
            if projected.get("n_intervals", 0) > 0:
                metrics["interval_coverage_projected"] = projected

    ensemble_run_id = fetch_model_run_ids(client).get(MODEL_NAMES["ensemble"])
    if ensemble_run_id and ensemble_run_id != model_run_id:
        candidate_errors = fetch_prediction_errors_by_origin(client, model_run_id)
        ensemble_errors = fetch_prediction_errors_by_origin(client, ensemble_run_id)
        improvement = aggregate_improvement_vs_ensemble(
            candidate_errors, ensemble_errors
        )
        if improvement:
            metrics["improvement_vs_ensemble"] = improvement

    return metrics


def compute_and_store_metrics(
    client: Client,
    model_run_id: str,
) -> dict[str, Any]:
    """Recompute evaluation metrics for a model run from prediction_actuals join."""
    from scripts.lib.neural_ode.metrics import aggregate_prediction_actuals

    preds_response = (
        client.table("predictions")
        .select(
            "id, horizon_weeks, entity_type, entity_id, forecast_origin_week, "
            "predicted_activity_index, lower_bound, upper_bound, model_run_id"
        )
        .eq("model_run_id", model_run_id)
        .execute()
    )
    preds = preds_response.data or []
    actuals, pred_horizon = _fetch_scored_actuals_for_predictions(client, preds)
    enriched = _enrich_actual_rows_for_metrics(client, preds, actuals)
    metrics = aggregate_prediction_actuals(enriched, pred_horizon=pred_horizon)
    if metrics:
        run_resp = (
            client.table("model_runs")
            .select("model_type, metrics")
            .eq("id", model_run_id)
            .limit(1)
            .execute()
        )
        rows = run_resp.data or []
        existing = dict(rows[0].get("metrics") or {}) if rows else {}
        gates = existing.get("correction_gates_by_horizon")
        if gates:
            metrics["correction_gates_by_horizon"] = gates
        if rows and rows[0].get("model_type") == "neural_ode":
            metrics = _enrich_neural_ode_metrics(
                client,
                model_run_id,
                metrics,
                preds,
                enriched,
                pred_horizon,
            )
        update_model_run_metrics(client, model_run_id, metrics)
    return metrics


def create_client_from_config(config: IngestionConfig | None = None) -> Client:
    from scripts.lib.config import load_config

    cfg = config or load_config()
    return create_service_client(cfg)
