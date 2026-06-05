"""Supabase I/O for Neural ODE inference outputs."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from supabase import Client

from scripts.lib.config import BATCH_SIZE
from scripts.lib.forecast_baselines import ResidualStats
from scripts.lib.forecast_db import load_residual_stats_from_metrics, upsert_predictions
from scripts.lib.neural_ode.inference import DerivativeSample
from scripts.lib.neural_ode.train_runner import model_name_for_region
from scripts.lib.supabase_client import upsert_batch

logger = logging.getLogger(__name__)


def fetch_production_neural_ode_run(
    client: Client,
    entity_type: str,
    entity_id: str,
) -> dict[str, Any] | None:
    """Return production model_runs row for this region, or None."""
    return fetch_neural_ode_model_run(
        client,
        entity_type,
        entity_id,
        status="production",
    )


def fetch_neural_ode_model_run(
    client: Client,
    entity_type: str,
    entity_id: str,
    *,
    status: str | None = "production",
    version: str | None = None,
    model_run_id: str | None = None,
) -> dict[str, Any] | None:
    """
    Resolve a Neural ODE model_runs row for inference.

    Priority: model_run_id > version (+ optional status) > status-only (latest by version).
    """
    select_cols = "id, model_name, version, status, artifact_path, metrics, hyperparameters"
    if model_run_id:
        response = (
            client.table("model_runs")
            .select(select_cols)
            .eq("id", model_run_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None

    name = model_name_for_region(entity_type, entity_id)
    query = (
        client.table("model_runs")
        .select(select_cols)
        .eq("model_name", name)
    )
    if version:
        query = query.eq("version", version)
    if status:
        query = query.eq("status", status)
    response = query.order("version", desc=True).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def residual_stats_for_neural_run(metrics: dict[str, Any]) -> ResidualStats:
    """Use residual_sigma_by_horizon when present; else MAE from holdout metrics."""
    if metrics.get("residual_sigma_by_horizon"):
        return load_residual_stats_from_metrics(metrics)
    by_horizon = metrics.get("by_horizon") or {}
    fallback: dict[int, float] = {}
    for key, block in by_horizon.items():
        if isinstance(block, dict) and block.get("mae") is not None:
            fallback[int(key)] = float(block["mae"])
    return ResidualStats(by_horizon=fallback)


def fetch_prediction_id_map(
    client: Client,
    *,
    model_run_id: str,
    entity_type: str,
    entity_id: str,
    origin_weeks: list[date],
) -> dict[tuple[str, int], str]:
    """Map (forecast_origin_week ISO, horizon_weeks) -> prediction id."""
    if not origin_weeks:
        return {}

    week_strs = sorted({w.isoformat() for w in origin_weeks})
    result: dict[tuple[str, int], str] = {}
    chunk = 50
    for i in range(0, len(week_strs), chunk):
        batch_weeks = week_strs[i : i + chunk]
        response = (
            client.table("predictions")
            .select("id, forecast_origin_week, horizon_weeks")
            .eq("model_run_id", model_run_id)
            .eq("entity_type", entity_type)
            .eq("entity_id", entity_id)
            .in_("forecast_origin_week", batch_weeks)
            .execute()
        )
        for row in response.data or []:
            key = (str(row["forecast_origin_week"])[:10], int(row["horizon_weeks"]))
            result[key] = str(row["id"])
    return result


def upsert_prediction_derivatives(
    client: Client,
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        upsert_batch(
            client,
            "prediction_derivatives",
            batch,
            on_conflict="prediction_id,step_idx",
        )
        total += len(batch)
        logger.info("Upserted %d prediction_derivatives (total %d)", len(batch), total)
    return total


def derivative_row(prediction_id: str, sample: DerivativeSample) -> dict[str, Any]:
    return {
        "prediction_id": prediction_id,
        "step_idx": sample.step_idx,
        "t_offset_days": sample.t_offset_days,
        "predicted_value": sample.predicted_value,
        "predicted_derivative": sample.predicted_derivative,
    }
