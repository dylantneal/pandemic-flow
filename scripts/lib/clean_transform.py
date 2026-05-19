"""Transform Illinois raw rows into clean_observations."""

from __future__ import annotations

import logging
import sys
from datetime import date, timedelta
from typing import Any

from scripts.lib.cleaning_rules import _parse_date, transform_raw_row
from scripts.lib.config import BATCH_SIZE, IngestionConfig, load_config
from scripts.lib.raw_il_fetch import fetch_illinois_raw_rows
from scripts.lib.supabase_client import create_service_client, upsert_batch

logger = logging.getLogger(__name__)

RECENT_WINDOW_DAYS = 28


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def build_recent_sample_counts(
    rows: list[dict[str, Any]],
    reference_date: date,
) -> dict[str, int]:
    cutoff = reference_date - timedelta(days=RECENT_WINDOW_DAYS)
    counts: dict[str, int] = {}
    for row in rows:
        sample_date = _parse_date(row.get("sample_collect_date"))
        if sample_date is None or sample_date < cutoff:
            continue
        site_id = str(row.get("site") or "")
        counts[site_id] = counts.get(site_id, 0) + 1
    return counts


def reference_date_from_rows(rows: list[dict[str, Any]]) -> date:
    dates = [_parse_date(r.get("sample_collect_date")) for r in rows]
    valid = [d for d in dates if d is not None]
    if not valid:
        raise RuntimeError("No valid sample dates in Illinois raw data")
    return max(valid)


def transform_clean_observations(config: IngestionConfig) -> int:
    _setup_logging()
    client = create_service_client(config)

    # Ensure sites exist
    sites_resp = client.table("sites").select("site_id").limit(1).execute()
    if not sites_resp.data:
        logger.error("sites table is empty — run refresh_sites.py first")
        return 1

    il_rows = fetch_illinois_raw_rows(client)
    if not il_rows:
        logger.error("No Illinois raw rows found")
        return 1

    ref_date = reference_date_from_rows(il_rows)
    recent_counts = build_recent_sample_counts(il_rows, ref_date)
    logger.info(
        "Transforming %d IL rows (reference_date=%s)",
        len(il_rows),
        ref_date,
    )

    clean_batch: list[dict[str, Any]] = []
    upserted = 0
    skipped = 0

    for row in il_rows:
        try:
            clean = transform_raw_row(
                row,
                reference_date=ref_date,
                site_recent_sample_counts=recent_counts,
            )
            if clean.get("sample_date") is None:
                skipped += 1
                continue
            clean_batch.append(clean)
        except Exception as exc:  # noqa: BLE001
            skipped += 1
            logger.warning(
                "Skip raw %s: %s",
                row.get("record_id", "?"),
                exc,
            )

        if len(clean_batch) >= BATCH_SIZE:
            upsert_batch(
                client,
                "clean_observations",
                clean_batch,
                on_conflict="raw_sample_id",
            )
            upserted += len(clean_batch)
            logger.info("Upserted %d clean observations", upserted)
            clean_batch.clear()

    if clean_batch:
        upsert_batch(
            client,
            "clean_observations",
            clean_batch,
            on_conflict="raw_sample_id",
        )
        upserted += len(clean_batch)

    logger.info(
        "Clean transform complete: upserted=%d skipped=%d",
        upserted,
        skipped,
    )
    return 0
