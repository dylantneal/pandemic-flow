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


def evaluate_forecasts(config: IngestionConfig | None = None) -> int:
    _setup_logging()
    cfg = config or load_config()
    client = create_client_from_config(cfg)

    unscored = fetch_unscored_predictions(client)
    if not unscored:
        logger.info("No unscored predictions with available actuals")
    else:
        logger.info("Scoring %d predictions", len(unscored))

        # Origin actuals for trend correctness
        from scripts.lib.forecast_db import REGIONS, fetch_region_history

        origin_lookup: dict[tuple[str, str, str], float] = {}
        for entity_type, entity_id, _ in REGIONS:
            history = fetch_region_history(client, entity_type, entity_id)
            for pt in history:
                origin_lookup[(entity_type, entity_id, pt.week_start.isoformat())] = pt.value

        actual_rows: list[dict] = []
        for pred in unscored:
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

        inserted = insert_prediction_actuals(client, actual_rows)
        logger.info("Inserted %d prediction_actuals rows", inserted)

    # Recompute metrics for all model runs
    model_run_ids = fetch_model_run_ids(client)
    for model_name, run_id in model_run_ids.items():
        metrics = compute_and_store_metrics(client, run_id)
        n = metrics.get("total_evaluations", 0)
        logger.info("Updated metrics for %s: %d evaluations", model_name, n)

    return 0


def main() -> int:
    return evaluate_forecasts()


if __name__ == "__main__":
    raise SystemExit(main())
