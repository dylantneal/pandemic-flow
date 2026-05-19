"""Fetch Illinois rows from raw_cdc_wastewater_samples."""

from __future__ import annotations

import logging
from typing import Any, Iterator

from scripts.lib.geo_filters import is_illinois

logger = logging.getLogger(__name__)

# PostgREST on Supabase caps each response at 1000 rows.
POSTGREST_MAX_ROWS = 1000

SITES_COLUMNS = (
    "id,site,state_territory,county_fips,counties_served,population_served,"
    "sample_collect_date,pcr_target_units,sample_matrix,sample_location"
)

CLEAN_COLUMNS = (
    "id,record_id,site,state_territory,county_fips,counties_served,"
    "sample_collect_date,pcr_target,pcr_target_units,pcr_target_detect,"
    "pcr_target_avg_conc,pcr_target_avg_conc_lin,pcr_target_flowpop_lin,"
    "lod_sewage,ntc_amplify,inhibition_detect,sample_location,sample_matrix,"
    "sample_type,major_lab_method,pcr_type,extraction_method"
)

# Illinois data in NWSS starts ~2021; extend upper bound for future samples.
YEAR_START = 2020
YEAR_END = 2030


def _year_ranges() -> Iterator[tuple[str, str]]:
    for year in range(YEAR_START, YEAR_END + 1):
        yield f"{year}-01-01", f"{year}-12-31"


def _paginate_il(
    client: Any,
    columns: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()

    for state in ("il", "IL"):
        for date_from, date_to in _year_ranges():
            offset = 0
            while True:
                response = (
                    client.table("raw_cdc_wastewater_samples")
                    .select(columns)
                    .eq("state_territory", state)
                    .gte("sample_collect_date", date_from)
                    .lte("sample_collect_date", date_to)
                    .order("sample_collect_date")
                    .range(offset, offset + POSTGREST_MAX_ROWS - 1)
                    .execute()
                )
                batch = response.data or []
                if not batch:
                    break
                for row in batch:
                    rid = row["id"]
                    if rid not in seen:
                        seen.add(rid)
                        rows.append(row)
                logger.info(
                    "Fetched %d rows state=%s %s–%s offset=%d (unique total %d)",
                    len(batch),
                    state,
                    date_from[:4],
                    date_to[:4],
                    offset,
                    len(rows),
                )
                if len(batch) < POSTGREST_MAX_ROWS:
                    break
                offset += POSTGREST_MAX_ROWS

    return [r for r in rows if is_illinois(r.get("state_territory"))]


def fetch_illinois_raw_rows(client: Any) -> list[dict[str, Any]]:
    return _paginate_il(client, CLEAN_COLUMNS)


def fetch_illinois_rows_for_sites(client: Any) -> list[dict[str, Any]]:
    return _paginate_il(client, SITES_COLUMNS)
