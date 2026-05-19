"""CDC NWSS wastewater CSV schema contract."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

# Exact column order from CDC export (38 columns).
EXPECTED_COLUMNS: tuple[str, ...] = (
    "record_id",
    "site",
    "state_territory",
    "source",
    "county_fips",
    "counties_served",
    "population_served",
    "sample_id",
    "sample_collect_date",
    "sample_type",
    "sample_matrix",
    "sample_location",
    "flow_rate",
    "concentration_method",
    "pasteurized",
    "pcr_type",
    "extraction_method",
    "major_lab_method",
    "inhibition_detect",
    "inhibition_adjust",
    "ntc_amplify",
    "pcr_target",
    "pcr_gene_target_agg",
    "pcr_target_avg_conc",
    "pcr_target_units",
    "lod_sewage",
    "pcr_target_detect",
    "pcr_target_avg_conc_lin",
    "pcr_target_flowpop_lin",
    "pcr_target_mic_lin",
    "hum_frac_target_mic",
    "hum_frac_mic_conc",
    "hum_frac_mic_unit",
    "rec_eff_percent",
    "rec_eff_target_name",
    "rec_eff_spike_matrix",
    "rec_eff_spike_conc",
    "date_updated",
)

NUMERIC_COLUMNS = frozenset(
    {
        "population_served",
        "flow_rate",
        "pcr_target_avg_conc",
        "lod_sewage",
        "pcr_target_avg_conc_lin",
        "pcr_target_flowpop_lin",
        "pcr_target_mic_lin",
        "hum_frac_mic_conc",
        "rec_eff_percent",
        "rec_eff_spike_conc",
    }
)

DATE_COLUMNS = frozenset({"sample_collect_date"})
TIMESTAMP_COLUMNS = frozenset({"date_updated"})


def schema_hash() -> str:
    payload = json.dumps(list(EXPECTED_COLUMNS), separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def validate_header(header: list[str]) -> None:
    normalized = [col.strip() for col in header]
    if normalized != list(EXPECTED_COLUMNS):
        missing = set(EXPECTED_COLUMNS) - set(normalized)
        extra = set(normalized) - set(EXPECTED_COLUMNS)
        details: list[str] = []
        if missing:
            details.append(f"missing columns: {sorted(missing)}")
        if extra:
            details.append(f"unexpected columns: {sorted(extra)}")
        if not details:
            details.append("column order does not match expected CDC schema")
        raise ValueError("; ".join(details))


def _empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


def _parse_numeric(value: str | None) -> float | None:
    text = _empty_to_none(value)
    if text is None:
        return None
    try:
        return float(Decimal(text))
    except (InvalidOperation, ValueError):
        return None


def _parse_date(value: str | None) -> str | None:
    text = _empty_to_none(value)
    if text is None:
        return None
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        pass
    try:
        return datetime.strptime(text, "%m/%d/%Y").date().isoformat()
    except ValueError as exc:
        raise ValueError(f"invalid sample_collect_date: {text!r}") from exc


def _parse_timestamp(value: str | None) -> str | None:
    text = _empty_to_none(value)
    if text is None:
        return None
    for fmt in (
        "%m/%d/%Y %I:%M:%S %p",
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            return datetime.strptime(text, fmt).isoformat()
        except ValueError:
            continue
    raise ValueError(f"invalid date_updated: {text!r}")


def normalize_row(row: dict[str, str]) -> dict[str, Any]:
    """Map CSV row to Supabase-ready dict with typed fields."""
    record: dict[str, Any] = {}
    for column in EXPECTED_COLUMNS:
        raw = row.get(column, "")
        if column in NUMERIC_COLUMNS:
            record[column] = _parse_numeric(raw)
        elif column in DATE_COLUMNS:
            record[column] = _parse_date(raw)
        elif column in TIMESTAMP_COLUMNS:
            record[column] = _parse_timestamp(raw)
        else:
            record[column] = _empty_to_none(raw)

    if not record.get("record_id"):
        raise ValueError("row missing record_id")
    if not record.get("site"):
        raise ValueError(f"row {record['record_id']} missing site")
    if not record.get("sample_collect_date"):
        raise ValueError(f"row {record['record_id']} missing sample_collect_date")

    return record


def compute_row_hash(row: dict[str, Any]) -> str:
    """Stable hash over normalized CDC field values (excludes ingestion metadata)."""
    payload = {col: row.get(col) for col in EXPECTED_COLUMNS}
    canonical = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
