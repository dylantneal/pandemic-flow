"""Generate Neural ODE predictions and derivatives for production model runs."""

from __future__ import annotations

import logging
import sys
import tempfile
from pathlib import Path
from typing import Any

from supabase import Client

from scripts.lib.config import IngestionConfig, load_config
from scripts.lib.forecast_baselines import rolling_origin_indices
from scripts.lib.forecast_db import (
    REGIONS,
    create_client_from_config,
    fetch_region_history,
    forecast_point_to_row,
    merge_model_run_metrics,
    upsert_predictions,
)
from scripts.lib.neural_ode.gates import correction_gates_metrics_dict
from scripts.lib.neural_ode.artifacts import download_checkpoint, load_checkpoint
from scripts.lib.neural_ode.infer_db import (
    derivative_row,
    fetch_neural_ode_model_run,
    fetch_prediction_id_map,
    fetch_production_neural_ode_run,
    residual_stats_for_neural_run,
    upsert_prediction_derivatives,
)
from scripts.lib.neural_ode.covariates import CovariateStats, covariate_stats_from_dict
from scripts.lib.neural_ode.inference import forecast_at_origin
from scripts.lib.neural_ode.model import NeuralODE

logger = logging.getLogger(__name__)

# Minimum history before emitting forecasts (no seasonal lag required at inference)
MIN_HISTORY_WEEKS = 8


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def load_production_model(
    client: Client,
    model_run: dict[str, Any],
) -> tuple[NeuralODE, float, float, CovariateStats | None, bool]:
    artifact_path = model_run.get("artifact_path")
    if not artifact_path:
        raise RuntimeError(
            f"model_run {model_run.get('model_name')} has no artifact_path"
        )
    with tempfile.TemporaryDirectory(prefix="neural_ode_infer_") as tmp:
        local_path = download_checkpoint(client, artifact_path, Path(tmp) / "checkpoint.pt")
        model, mean, std, _bundle, cov_stats = load_checkpoint(local_path)
    hyper = model_run.get("hyperparameters") or {}
    if "mean" in hyper and "std" in hyper:
        mean = float(hyper["mean"])
        std = float(hyper["std"])
    if cov_stats is None and hyper.get("covariate_stats"):
        cov_stats = covariate_stats_from_dict(hyper["covariate_stats"])
    with_cov = bool((hyper.get("model_config") or {}).get("with_covariates", False))
    return model, mean, std, cov_stats, with_cov


def infer_region(
    client: Client,
    *,
    entity_type: str,
    entity_id: str,
    region_name: str,
    history: list,
    model_run: dict[str, Any],
    origin_indices: list[int],
) -> tuple[int, int]:
    """Run inference for one region; return (predictions, derivatives) written."""
    model, mean, std, cov_stats, with_cov = load_production_model(client, model_run)
    metrics = model_run.get("metrics") or {}
    residual_stats = residual_stats_for_neural_run(metrics)
    model_run_id = str(model_run["id"])
    gate_patch = correction_gates_metrics_dict(model)
    if gate_patch:
        merge_model_run_metrics(client, model_run_id, gate_patch)

    results = [
        forecast_at_origin(
            model,
            history,
            origin_index,
            mean,
            std,
            residual_stats=residual_stats,
            covariate_stats=cov_stats,
            with_covariates=with_cov,
            region_key=f"{entity_type}:{entity_id}",
        )
        for origin_index in origin_indices
    ]

    pred_rows: list[dict[str, Any]] = []
    for result in results:
        for fp in result.forecasts:
            pred_rows.append(
                forecast_point_to_row(
                    model_run_id,
                    entity_type,
                    entity_id,
                    result.forecast_origin_week,
                    fp,
                )
            )

    n_preds = upsert_predictions(client, pred_rows)

    origin_weeks = [r.forecast_origin_week for r in results]
    id_map = fetch_prediction_id_map(
        client,
        model_run_id=model_run_id,
        entity_type=entity_type,
        entity_id=entity_id,
        origin_weeks=origin_weeks,
    )

    deriv_rows: list[dict[str, Any]] = []
    for result in results:
        origin_key = result.forecast_origin_week.isoformat()
        for sample in result.derivatives:
            pred_id = id_map.get((origin_key, sample.horizon_weeks))
            if not pred_id:
                logger.warning(
                    "Missing prediction id for %s origin=%s horizon=%d",
                    region_name,
                    origin_key,
                    sample.horizon_weeks,
                )
                continue
            deriv_rows.append(derivative_row(pred_id, sample))

    n_derivs = upsert_prediction_derivatives(client, deriv_rows)
    return n_preds, n_derivs


def infer_neural_ode(
    config: IngestionConfig | None = None,
    *,
    backfill_weeks: int = 0,
    allow_candidate: bool = False,
    version: str | None = None,
    model_run_id: str | None = None,
) -> int:
    """
    Write predictions + prediction_derivatives for production Neural ODE runs.
    No-op when no production model exists for a region.

    Gate loop: pass ``version`` or ``model_run_id`` to infer a specific candidate
    regardless of production status.
    """
    _setup_logging()
    cfg = config or load_config()
    client = create_client_from_config(cfg)

    total_preds = 0
    total_derivs = 0
    any_run = False

    for entity_type, entity_id, region_name in REGIONS:
        model_run: dict[str, Any] | None = None
        if version or model_run_id:
            model_run = fetch_neural_ode_model_run(
                client,
                entity_type,
                entity_id,
                status=None,
                version=version,
                model_run_id=model_run_id,
            )
        elif allow_candidate:
            model_run = fetch_neural_ode_model_run(
                client,
                entity_type,
                entity_id,
                status="candidate",
            )
            if not model_run:
                model_run = fetch_production_neural_ode_run(client, entity_type, entity_id)
        else:
            model_run = fetch_production_neural_ode_run(client, entity_type, entity_id)

        if not model_run:
            logger.info(
                "Skipping %s: no production Neural ODE model_run (train and promote first)",
                region_name,
            )
            continue

        any_run = True
        hyper = model_run.get("hyperparameters") or {}
        with_cov = bool((hyper.get("model_config") or {}).get("with_covariates", False))
        history = fetch_region_history(
            client, entity_type, entity_id, with_covariates=with_cov
        )
        if not history:
            logger.warning("No history for %s", region_name)
            continue

        origin_indices = rolling_origin_indices(
            len(history),
            backfill_weeks=backfill_weeks,
            min_history_weeks=MIN_HISTORY_WEEKS,
        )
        if not origin_indices:
            logger.warning("Insufficient history for %s (%d weeks)", region_name, len(history))
            continue

        logger.info(
            "Neural ODE inference for %s: %d origins, model=%s",
            region_name,
            len(origin_indices),
            model_run.get("model_name"),
        )

        n_preds, n_derivs = infer_region(
            client,
            entity_type=entity_type,
            entity_id=entity_id,
            region_name=region_name,
            history=history,
            model_run=model_run,
            origin_indices=origin_indices,
        )
        total_preds += n_preds
        total_derivs += n_derivs

    if not any_run:
        logger.info("Neural ODE inference skipped (no production models)")
    else:
        logger.info(
            "Neural ODE inference complete: %d predictions, %d derivatives",
            total_preds,
            total_derivs,
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Infer Neural ODE forecasts")
    parser.add_argument(
        "--backfill-weeks",
        type=int,
        default=0,
        help="Rolling origin weeks to backfill (0 = latest only)",
    )
    parser.add_argument(
        "--allow-candidate",
        action="store_true",
        help="Use latest candidate model if no production model (dev only)",
    )
    parser.add_argument(
        "--version",
        help="Infer this model version (gate loop; overrides production)",
    )
    parser.add_argument(
        "--model-run-id",
        help="Infer this model_runs UUID (gate loop)",
    )
    args = parser.parse_args(argv)
    return infer_neural_ode(
        backfill_weeks=args.backfill_weeks,
        allow_candidate=args.allow_candidate or bool(args.version or args.model_run_id),
        version=args.version,
        model_run_id=args.model_run_id,
    )
