"""Refresh sites table from Illinois raw CDC samples."""

from __future__ import annotations

import logging
import sys
from collections import defaultdict
from datetime import date
from typing import Any

from scripts.lib.cleaning_rules import _parse_date, aggregate_site_from_rows
from scripts.lib.config import IngestionConfig, load_config
from scripts.lib.raw_il_fetch import fetch_illinois_rows_for_sites
from scripts.lib.supabase_client import create_service_client, upsert_batch

logger = logging.getLogger(__name__)


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def reference_date_from_rows(rows: list[dict[str, Any]]) -> date:
    dates = [_parse_date(r.get("sample_collect_date")) for r in rows]
    valid = [d for d in dates if d is not None]
    if not valid:
        raise RuntimeError("No valid sample dates in Illinois raw data")
    return max(valid)


def refresh_sites(config: IngestionConfig) -> int:
    _setup_logging()
    client = create_service_client(config)

    il_rows = fetch_illinois_rows_for_sites(client)
    if not il_rows:
        logger.error("No Illinois raw rows found")
        return 1

    ref_date = reference_date_from_rows(il_rows)
    logger.info("Reference date for active_status: %s", ref_date)

    by_site: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in il_rows:
        by_site[str(row["site"])].append(row)

    site_payloads: list[dict[str, Any]] = []
    for site_id, site_rows in by_site.items():
        site_payloads.append(
            aggregate_site_from_rows(site_id, site_rows, ref_date)
        )

    logger.info("Upserting %d sites", len(site_payloads))
    for i in range(0, len(site_payloads), 500):
        batch = site_payloads[i : i + 500]
        upsert_batch(client, "sites", batch, on_conflict="site_id")

    cook_sites = sum(1 for s in site_payloads if s.get("is_cook_county_site"))
    logger.info(
        "Sites refresh complete: %d sites (%d Cook County sites)",
        len(site_payloads),
        cook_sites,
    )
    return 0
