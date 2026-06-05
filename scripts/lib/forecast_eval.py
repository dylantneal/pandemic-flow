"""Evaluate historical forecasts against actual weekly region metrics."""

from __future__ import annotations

import logging
import sys

from scripts.lib.config import IngestionConfig, load_config
from scripts.lib.forecast_baselines import trend_from_change
from scripts.lib.forecast_db import (
    compute_and_store_metrics,
    create_client_from_config,
    fetch_model_run_ids,
    fetch_neural_ode_model_run_ids,
    fetch_scorable_predictions,
    fetch_unscored_predictions,
    insert_prediction_actuals,
)

logger = logging.getLogger(__name__)


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def _actual_trend(actual: float, origin_actual: float | None) -> str:
    if origin_actual is None:
        return "insufficient_data"
    return trend_from_change(actual - origin_actual)


def evaluate_forecasts(
    config: IngestionConfig | None = None,
    *,
    neural_ode_version: str | None = None,
) -> int:
    _setup_logging()
    cfg = config or load_config()
    client = create_client_from_config(cfg)

    if neural_ode_version:
        run_ids = fetch_neural_ode_model_run_ids(client, neural_ode_version)
        if not run_ids:
            logger.warning("No neural_ode model_runs for version %s", neural_ode_version)
        to_score = fetch_scorable_predictions(
            client,
            model_run_ids=run_ids or None,
            include_scored=True,
        )
        score_label = f"Rescoring {len(to_score)} predictions for neural_ode v{neural_ode_version}"
    else:
        to_score = fetch_unscored_predictions(client)
        score_label = f"Scoring {len(to_score)} unscored predictions"

    if not to_score:
        logger.info("No predictions with available actuals to score")
    else:
        logger.info(score_label)

        # Origin actuals and context for trend / regime / quality segmentation
        from scripts.lib.forecast_db import REGIONS, fetch_region_history

        origin_lookup: dict[tuple[str, str, str], float] = {}
        for entity_type, entity_id, _ in REGIONS:
            history = fetch_region_history(
                client, entity_type, entity_id, with_covariates=True
            )
            for pt in history:
                key = (entity_type, entity_id, pt.week_start.isoformat())
                origin_lookup[key] = pt.value

        actual_rows: list[dict] = []
        for pred in to_score:
            actual = float(pred["_actual"])
            predicted = float(pred["predicted_activity_index"])
            abs_err = abs(actual - predicted)
            sq_err = (actual - predicted) ** 2

            origin_key = (
                pred["entity_type"],
                pred["entity_id"],
                str(pred["forecast_origin_week"])[:10],
            )
            origin_actual = origin_lookup.get(origin_key)
            actual_trend = _actual_trend(actual, origin_actual)
            predicted_trend = pred.get("predicted_trend") or "insufficient_data"
            trend_correct = (
                actual_trend == predicted_trend
                if actual_trend != "insufficient_data"
                and predicted_trend != "insufficient_data"
                else None
            )

            actual_rows.append(
                {
                    "prediction_id": pred["id"],
                    "actual_activity_index": round(actual, 4),
                    "absolute_error": round(abs_err, 4),
                    "squared_error": round(sq_err, 4),
                    "trend_correct": trend_correct,
                }
            )

        upserted = insert_prediction_actuals(client, actual_rows)
        logger.info("Upserted %d prediction_actuals rows", upserted)

    # Recompute metrics for model runs
    if neural_ode_version:
        response = (
            client.table("model_runs")
            .select("id, model_name, version")
            .eq("model_type", "neural_ode")
            .eq("version", neural_ode_version)
            .execute()
        )
        targets = [(r["model_name"], r["id"]) for r in (response.data or [])]
        for model_name, run_id in targets:
            metrics = compute_and_store_metrics(client, str(run_id))
            n = metrics.get("total_evaluations", 0)
            logger.info("Updated metrics for %s v%s: %d evaluations", model_name, neural_ode_version, n)
    else:
        model_run_ids = fetch_model_run_ids(client)
        for model_name, run_id in model_run_ids.items():
            metrics = compute_and_store_metrics(client, run_id)
            n = metrics.get("total_evaluations", 0)
            logger.info("Updated metrics for %s: %d evaluations", model_name, n)

    return 0


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Score predictions and update model metrics")
    parser.add_argument(
        "--neural-ode-version",
        help=(
            "Rescore all neural_ode predictions at this version and recompute "
            "their model_runs metrics (gate loop)"
        ),
    )
    args = parser.parse_args(argv)
    return evaluate_forecasts(neural_ode_version=args.neural_ode_version)


if __name__ == "__main__":
    raise SystemExit(main())
