#!/usr/bin/env python3
"""
Run the full weekly CDC data pipeline: ingest, clean, weekly metrics, optional cache revalidation.

Usage:
  python scripts/run_weekly_pipeline.py

Environment (required):
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional:
  CDC_WASTEWATER_CSV_URL
  INGESTION_TRIGGER_TYPE (default: manual; use 'schedule' in GitHub Actions)
  GIT_COMMIT or GITHUB_SHA
  VERCEL_REVALIDATE_URL + VERCEL_REVALIDATE_SECRET (both or neither)
"""

from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path
from typing import Callable

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.lib.clean_transform import transform_clean_observations  # noqa: E402
from scripts.lib.config import IngestionConfig, load_config  # noqa: E402
from scripts.lib.ingestion import ingest_cdc  # noqa: E402
from scripts.lib.sites_refresh import refresh_sites  # noqa: E402
from scripts.lib.forecast_eval import evaluate_forecasts  # noqa: E402
from scripts.lib.forecast_runner import generate_forecasts  # noqa: E402
from scripts.lib.neural_ode.infer_runner import infer_neural_ode  # noqa: E402
from scripts.lib.weekly_metrics_build import build_weekly_metrics  # noqa: E402

logger = logging.getLogger(__name__)

StepFn = Callable[[IngestionConfig], int]


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def revalidate_vercel_cache() -> int:
    """
    POST to Vercel revalidation endpoint when configured.
    Returns 0 on success or skip; 1 on misconfiguration or HTTP failure.
    """
    url = os.environ.get("VERCEL_REVALIDATE_URL", "").strip()
    secret = os.environ.get("VERCEL_REVALIDATE_SECRET", "").strip()

    if not url and not secret:
        logger.info("Vercel revalidation skipped (VERCEL_REVALIDATE_URL not set)")
        return 0

    if not url or not secret:
        logger.error(
            "Incomplete Vercel revalidation config: set both "
            "VERCEL_REVALIDATE_URL and VERCEL_REVALIDATE_SECRET, or neither"
        )
        return 1

    logger.info("Revalidating Vercel cache at %s", url)
    try:
        response = httpx.post(
            url,
            headers={"Authorization": f"Bearer {secret}"},
            timeout=httpx.Timeout(60.0),
        )
        response.raise_for_status()
        logger.info("Vercel revalidation succeeded (%s)", response.status_code)
        return 0
    except Exception as exc:  # noqa: BLE001
        logger.exception("Vercel revalidation failed: %s", exc)
        return 1


def run_weekly_pipeline(config: IngestionConfig | None = None) -> int:
    """Execute all pipeline steps in order. Returns 0 on success."""
    _setup_logging()
    cfg = config or load_config()

    def _evaluate_forecasts(cfg: IngestionConfig) -> int:
        return evaluate_forecasts(cfg)

    def _generate_forecasts(cfg: IngestionConfig) -> int:
        return generate_forecasts(cfg, backfill_weeks=0)

    def _infer_neural_ode(cfg: IngestionConfig) -> int:
        return infer_neural_ode(cfg, backfill_weeks=0)

    steps: list[tuple[str, StepFn]] = [
        ("ingest_cdc", ingest_cdc),
        ("refresh_sites", refresh_sites),
        ("transform_clean_observations", transform_clean_observations),
        ("build_weekly_metrics", build_weekly_metrics),
        ("evaluate_forecasts", _evaluate_forecasts),
        ("generate_forecasts", _generate_forecasts),
        ("infer_neural_ode", _infer_neural_ode),
    ]

    logger.info(
        "Starting weekly pipeline (trigger_type=%s, git_commit=%s)",
        cfg.trigger_type,
        cfg.git_commit or "n/a",
    )
    pipeline_start = time.monotonic()

    for name, step_fn in steps:
        step_start = time.monotonic()
        logger.info("--- Step: %s ---", name)
        code = step_fn(cfg)
        elapsed = time.monotonic() - step_start
        if code != 0:
            logger.error(
                "Step %s failed with exit code %d after %.1fs — stopping pipeline",
                name,
                code,
                elapsed,
            )
            return code
        logger.info("Step %s completed in %.1fs", name, elapsed)

    logger.info("--- Step: vercel_revalidate ---")
    revalidate_code = revalidate_vercel_cache()
    if revalidate_code != 0:
        logger.error("Vercel revalidation failed — stopping pipeline")
        return revalidate_code

    total_elapsed = time.monotonic() - pipeline_start
    logger.info("Weekly pipeline finished successfully in %.1fs", total_elapsed)
    return 0


def main() -> int:
    return run_weekly_pipeline()


if __name__ == "__main__":
    raise SystemExit(main())
