"""Build and upsert weekly site and region metrics."""

from __future__ import annotations

import logging
import sys
from typing import Any

from scripts.lib.config import BATCH_SIZE, IngestionConfig, load_config
from scripts.lib.supabase_client import create_service_client, upsert_batch
from scripts.lib.weekly_compute import (
    COOK_REGION_ID,
    COOK_REGION_NAME,
    IL_REGION_ID,
    IL_REGION_NAME,
    compute_region_weekly_metrics,
    compute_site_weekly_rows,
    cook_site_filter,
    illinois_site_filter,
)
from scripts.lib.weekly_fetch import fetch_model_clean_observations, fetch_sites

logger = logging.getLogger(__name__)

def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def _batch_upsert(
    client: Any,
    table: str,
    rows: list[dict[str, Any]],
    on_conflict: str,
) -> int:
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        upsert_batch(client, table, batch, on_conflict=on_conflict)
        total += len(batch)
        logger.info("Upserted %d rows into %s (total %d)", len(batch), table, total)
    return total


def build_weekly_metrics(config: IngestionConfig) -> int:
    _setup_logging()
    client = create_service_client(config)

    observations = fetch_model_clean_observations(client)
    if not observations:
        logger.error("No model-ready clean observations found")
        return 1

    sites = fetch_sites(client)
    sites_by_id = {s["site_id"]: s for s in sites}

    site_weekly = compute_site_weekly_rows(observations, sites_by_id)
    logger.info("Computed %d weekly site metric rows", len(site_weekly))

    cook_region = compute_region_weekly_metrics(
        site_weekly,
        sites_by_id,
        region_type="county",
        region_id=COOK_REGION_ID,
        region_name=COOK_REGION_NAME,
        site_filter=cook_site_filter,
    )
    il_region = compute_region_weekly_metrics(
        site_weekly,
        sites_by_id,
        region_type="state",
        region_id=IL_REGION_ID,
        region_name=IL_REGION_NAME,
        site_filter=illinois_site_filter,
    )
    logger.info(
        "Computed region metrics: Cook=%d weeks, Illinois=%d weeks",
        len(cook_region),
        len(il_region),
    )

    site_count = _batch_upsert(
        client,
        "weekly_site_metrics",
        site_weekly,
        on_conflict="site_id,week_start",
    )
    region_count = _batch_upsert(
        client,
        "weekly_region_metrics",
        cook_region + il_region,
        on_conflict="region_type,region_id,week_start",
    )

    logger.info(
        "Weekly metrics build complete: %d site rows, %d region rows",
        site_count,
        region_count,
    )
    return 0
