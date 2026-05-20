"""Generate baseline and ensemble forecasts for Illinois regions."""

from __future__ import annotations

import logging
import sys
from typing import Any

from scripts.lib.config import IngestionConfig, load_config
from scripts.lib.forecast_baselines import (
    DEFAULT_HORIZONS,
    ensemble_forecast,
    moving_average_forecast,
    persistence_forecast,
    rolling_origin_indices,
    seasonal_naive_forecast,
    trend_forecast,
)
from scripts.lib.forecast_db import (
    MODEL_NAMES,
    REGIONS,
    create_client_from_config,
    fetch_model_run_ids,
    fetch_model_runs_with_metrics,
    fetch_region_history,
    forecast_point_to_row,
    load_residual_stats_from_metrics,
    upsert_predictions,
)

logger = logging.getLogger(__name__)


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def _residual_stats_for_model(
    model_runs: list[dict[str, Any]],
    model_name: str,
) -> Any:
    for run in model_runs:
        if run["model_name"] == model_name:
            return load_residual_stats_from_metrics(run.get("metrics") or {})
    return load_residual_stats_from_metrics({})


def generate_forecasts_for_region(
    *,
    entity_type: str,
    entity_id: str,
    history: list,
    model_run_ids: dict[str, str],
    model_runs: list[dict[str, Any]],
    origin_indices: list[int],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for origin_index in origin_indices:
        origin = history[origin_index]
        origin_week = origin.week_start
        origin_value = origin.value

        p_stats = _residual_stats_for_model(model_runs, MODEL_NAMES["persistence"])
        ma_stats = _residual_stats_for_model(model_runs, MODEL_NAMES["moving_average"])
        t_stats = _residual_stats_for_model(model_runs, MODEL_NAMES["trend"])
        s_stats = _residual_stats_for_model(model_runs, MODEL_NAMES["seasonal_naive"])
        e_stats = _residual_stats_for_model(model_runs, MODEL_NAMES["ensemble"])

        p_fc = persistence_forecast(history, origin_index, DEFAULT_HORIZONS, p_stats)
        ma_fc = moving_average_forecast(history, origin_index, DEFAULT_HORIZONS, residual_stats=ma_stats)
        t_fc = trend_forecast(history, origin_index, DEFAULT_HORIZONS, residual_stats=t_stats)
        s_fc = seasonal_naive_forecast(history, origin_index, DEFAULT_HORIZONS, residual_stats=s_stats)
        ens_fc = ensemble_forecast([p_fc, ma_fc, t_fc, s_fc], origin_value, origin_week, e_stats)

        batches = [
            (MODEL_NAMES["persistence"], p_fc),
            (MODEL_NAMES["moving_average"], ma_fc),
            (MODEL_NAMES["trend"], t_fc),
            (MODEL_NAMES["seasonal_naive"], s_fc),
            (MODEL_NAMES["ensemble"], ens_fc),
        ]

        for model_name, forecasts in batches:
            run_id = model_run_ids.get(model_name)
            if not run_id:
                logger.warning("Missing model_run for %s", model_name)
                continue
            for fp in forecasts:
                rows.append(
                    forecast_point_to_row(run_id, entity_type, entity_id, origin_week, fp)
                )

    return rows


def generate_forecasts(
    config: IngestionConfig | None = None,
    *,
    backfill_weeks: int = 0,
) -> int:
    _setup_logging()
    cfg = config or load_config()
    client = create_client_from_config(cfg)

    model_run_ids = fetch_model_run_ids(client)
    if not model_run_ids:
        logger.error("No model_runs found — apply Phase 6 migration first")
        return 1

    model_runs = fetch_model_runs_with_metrics(client)
    all_rows: list[dict[str, Any]] = []

    for entity_type, entity_id, region_name in REGIONS:
        history = fetch_region_history(client, entity_type, entity_id)
        if not history:
            logger.warning("No history for %s (%s)", region_name, entity_id)
            continue

        origin_indices = rolling_origin_indices(len(history), backfill_weeks=backfill_weeks)
        if not origin_indices:
            logger.warning(
                "Insufficient history for %s (%d weeks)", region_name, len(history)
            )
            continue

        logger.info(
            "Generating forecasts for %s: %d origins, %d weeks history",
            region_name,
            len(origin_indices),
            len(history),
        )

        rows = generate_forecasts_for_region(
            entity_type=entity_type,
            entity_id=entity_id,
            history=history,
            model_run_ids=model_run_ids,
            model_runs=model_runs,
            origin_indices=origin_indices,
        )
        all_rows.extend(rows)

    count = upsert_predictions(client, all_rows)
    logger.info("Forecast generation complete: %d prediction rows", count)
    return 0


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Generate baseline forecasts")
    parser.add_argument(
        "--backfill-weeks",
        type=int,
        default=0,
        help="Number of rolling origin weeks to backfill (0 = latest only)",
    )
    args = parser.parse_args(argv)
    return generate_forecasts(backfill_weeks=args.backfill_weeks)


if __name__ == "__main__":
    raise SystemExit(main())
