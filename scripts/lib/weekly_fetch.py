"""Fetch clean observations and sites for weekly metrics."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any, Iterator

logger = logging.getLogger(__name__)

POSTGREST_MAX_ROWS = 1000

CLEAN_MODEL_COLUMNS = (
    "site_id,week_start,sample_date,log_concentration,state_territory,"
    "county_fips,is_cook_county,quality_score,quality_flags"
)

SITES_COLUMNS = (
    "site_id,state_territory,county_fips,is_cook_county_site,"
    "population_served,active_status"
)

YEAR_START = 2020
YEAR_END = 2030


def _year_ranges() -> Iterator[tuple[str, str]]:
    for year in range(YEAR_START, YEAR_END + 1):
        yield f"{year}-01-01", f"{year}-12-31"


def fetch_model_clean_observations(client: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()

    for date_from, date_to in _year_ranges():
        offset = 0
        while True:
            response = (
                client.table("clean_observations")
                .select(CLEAN_MODEL_COLUMNS)
                .eq("include_in_model", True)
                .gte("sample_date", date_from)
                .lte("sample_date", date_to)
                .order("sample_date")
                .range(offset, offset + POSTGREST_MAX_ROWS - 1)
                .execute()
            )
            batch = response.data or []
            if not batch:
                break
            for row in batch:
                key = f"{row['site_id']}|{row.get('sample_date')}|{row.get('log_concentration')}"
                if key not in seen:
                    seen.add(key)
                    rows.append(row)
            if len(batch) < POSTGREST_MAX_ROWS:
                break
            offset += POSTGREST_MAX_ROWS

    logger.info("Fetched %d model-ready clean observations", len(rows))
    return rows


def fetch_sites(client: Any) -> list[dict[str, Any]]:
    response = client.table("sites").select(SITES_COLUMNS).execute()
    sites = response.data or []
    logger.info("Fetched %d sites", len(sites))
    return sites
