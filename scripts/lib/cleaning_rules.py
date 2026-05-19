"""Row-level cleaning rules for CDC wastewater samples."""

from __future__ import annotations

import math
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any

from scripts.lib.geo_filters import is_cook_county

EXPECTED_PCR_TARGET = "sars-cov-2"
EXPECTED_UNITS = "copies/l wastewater"
EXPECTED_MATRIX = "raw wastewater"
EXPECTED_LOCATION = "wwtp"
LOW_QUALITY_THRESHOLD = 0.4

ACTIVE_DAYS = 14
RECENT_DAYS = 30
STALE_DAYS = 90


def iso_week_start(sample_date: date) -> date:
    """Monday of the ISO week containing sample_date."""
    return sample_date - timedelta(days=sample_date.weekday())


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def _parse_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def lab_method_group(
    major_lab_method: str | None,
    pcr_type: str | None,
    extraction_method: str | None,
) -> str | None:
    parts = [
        (major_lab_method or "").strip(),
        (pcr_type or "").strip(),
        (extraction_method or "").strip(),
    ]
    if not any(parts):
        return None
    return "|".join(parts)


def pick_concentration(
    pcr_target_avg_conc_lin: Any,
    pcr_target_avg_conc: Any,
) -> tuple[float | None, str | None]:
    lin = _to_float(pcr_target_avg_conc_lin)
    if lin is not None:
        return lin, "pcr_target_avg_conc_lin"
    avg = _to_float(pcr_target_avg_conc)
    if avg is not None:
        return avg, "pcr_target_avg_conc"
    return None, None


def compute_active_status(
    last_sample_date: date,
    reference_date: date,
) -> str:
    """Classify site activity relative to latest CDC sample date in DB."""
    age_days = (reference_date - last_sample_date).days
    if age_days <= ACTIVE_DAYS:
        return "active"
    if age_days <= RECENT_DAYS:
        return "recent"
    if age_days <= STALE_DAYS:
        return "stale"
    return "inactive"


def mode_value(values: list[str | None]) -> str | None:
    filtered = [v.strip() for v in values if v and v.strip()]
    if not filtered:
        return None
    return Counter(filtered).most_common(1)[0][0]


def transform_raw_row(
    raw: dict[str, Any],
    *,
    reference_date: date,
    site_recent_sample_counts: dict[str, int] | None = None,
) -> dict[str, Any]:
    """
    Apply cleaning rules to one raw row dict (Supabase snake_case keys).
    Returns payload for clean_observations insert/upsert.
    """
    flags: list[str] = []
    exclusion_reason: str | None = None

    sample_date = _parse_date(raw.get("sample_collect_date"))
    county_fips = raw.get("county_fips")
    counties_served = raw.get("counties_served")
    cook = is_cook_county(county_fips, counties_served)

    raw_conc, conc_source = pick_concentration(
        raw.get("pcr_target_avg_conc_lin"),
        raw.get("pcr_target_avg_conc"),
    )

    pcr_target = _norm(raw.get("pcr_target"))
    units = raw.get("pcr_target_units")
    units_norm = _norm(units) if units else None
    detect = _norm(raw.get("pcr_target_detect"))
    ntc = _norm(raw.get("ntc_amplify"))
    inhibition = _norm(raw.get("inhibition_detect"))
    sample_location = raw.get("sample_location")
    sample_matrix = raw.get("sample_matrix")
    sample_type = raw.get("sample_type") or ""
    lod = _to_float(raw.get("lod_sewage"))

    # Hard exclusions
    if sample_date is None:
        exclusion_reason = "missing_sample_date"
    elif raw_conc is None:
        exclusion_reason = "missing_concentration"
    elif pcr_target and pcr_target != EXPECTED_PCR_TARGET:
        exclusion_reason = "wrong_pcr_target"
    elif units_norm and units_norm != EXPECTED_UNITS:
        exclusion_reason = "inconsistent_units"
    elif ntc == "yes":
        exclusion_reason = "ntc_amplified"
    elif raw_conc is not None and raw_conc < 0:
        exclusion_reason = "invalid_concentration"

    # Soft quality flags
    below_lod = False
    if detect == "no":
        below_lod = True
        flags.append("below_lod")
    elif lod is not None and raw_conc is not None and raw_conc < lod / 2:
        below_lod = True
        flags.append("below_lod")

    if sample_location and _norm(sample_location) != EXPECTED_LOCATION:
        flags.append("non_wwtp_location")

    if sample_matrix and _norm(sample_matrix) != EXPECTED_MATRIX:
        flags.append("non_raw_matrix")

    if raw.get("pcr_target_flowpop_lin") is None:
        flags.append("missing_flowpop_norm")

    if inhibition == "yes":
        flags.append("inhibition_detected")

    if "grab" in _norm(sample_type):
        flags.append("grab_sample")

    detected = detect == "yes" if detect else None

    log_concentration: float | None = None
    if raw_conc is not None and raw_conc >= 0:
        log_concentration = math.log1p(raw_conc)

    normalized_concentration = _to_float(raw.get("pcr_target_flowpop_lin"))

    week_start = iso_week_start(sample_date) if sample_date else None

    # Quality score (0–1)
    score = 1.0
    if sample_date and reference_date:
        age = (reference_date - sample_date).days
        if age > 14:
            score -= 0.20
            flags.append("stale_sample")

    site_id = str(raw.get("site") or "")
    if site_recent_sample_counts is not None:
        recent = site_recent_sample_counts.get(site_id, 0)
        if recent < 3:
            score -= 0.20
            flags.append("few_recent_samples")

    if units_norm and units_norm != EXPECTED_UNITS:
        score -= 0.20

    if below_lod:
        score -= 0.10

    if inhibition == "yes":
        score -= 0.10

    if ntc == "yes":
        score -= 0.15

    score = max(0.0, min(1.0, score))

    include_in_model = exclusion_reason is None
    if include_in_model and score < LOW_QUALITY_THRESHOLD:
        include_in_model = False
        exclusion_reason = "low_quality_score"

    return {
        "raw_sample_id": raw["id"],
        "site_id": site_id,
        "sample_date": sample_date.isoformat() if sample_date else None,
        "week_start": week_start.isoformat() if week_start else None,
        "state_territory": raw.get("state_territory"),
        "county_fips": county_fips,
        "counties_served": counties_served,
        "is_cook_county": cook,
        "raw_concentration": raw_conc,
        "log_concentration": log_concentration,
        "normalized_concentration": normalized_concentration,
        "concentration_source": conc_source,
        "units": units,
        "detected": detected,
        "below_lod": below_lod,
        "sample_matrix": sample_matrix,
        "sample_type": sample_type or None,
        "sample_location": sample_location,
        "lab_method_group": lab_method_group(
            raw.get("major_lab_method"),
            raw.get("pcr_type"),
            raw.get("extraction_method"),
        ),
        "include_in_model": include_in_model,
        "exclusion_reason": exclusion_reason,
        "quality_score": round(score, 4),
        "quality_flags": flags,
    }


def aggregate_site_from_rows(
    site_id: str,
    rows: list[dict[str, Any]],
    reference_date: date,
) -> dict[str, Any]:
    """Build one sites table row from raw IL rows for a site."""
    dates = [_parse_date(r.get("sample_collect_date")) for r in rows]
    valid_dates = [d for d in dates if d is not None]
    if not valid_dates:
        raise ValueError(f"site {site_id} has no valid sample dates")

    cook_site = any(
        is_cook_county(r.get("county_fips"), r.get("counties_served")) for r in rows
    )

    last_sample = max(valid_dates)
    first_sample = min(valid_dates)

    return {
        "site_id": site_id,
        "state_territory": rows[0].get("state_territory"),
        "county_fips": rows[0].get("county_fips"),
        "counties_served": rows[0].get("counties_served"),
        "population_served": rows[0].get("population_served"),
        "first_sample_date": first_sample.isoformat(),
        "last_sample_date": last_sample.isoformat(),
        "sample_count": len(rows),
        "active_status": compute_active_status(last_sample, reference_date),
        "is_cook_county_site": cook_site,
        "dominant_units": mode_value([r.get("pcr_target_units") for r in rows]),
        "dominant_sample_matrix": mode_value([r.get("sample_matrix") for r in rows]),
        "dominant_sample_location": mode_value([r.get("sample_location") for r in rows]),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
