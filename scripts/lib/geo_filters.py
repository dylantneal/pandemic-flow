"""Geographic filters for Illinois and Cook County CDC data."""

from __future__ import annotations

import re

COOK_COUNTY_FIPS = "17031"
ILLINOIS_STATE_CODES = frozenset({"il", "illinois"})


def _normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    return value.strip().lower()


def _parse_fips_tokens(county_fips: str | None) -> list[str]:
    if not county_fips:
        return []
    cleaned = county_fips.replace('"', "").strip()
    return [token.strip() for token in re.split(r"[,;]", cleaned) if token.strip()]


def is_illinois(state_territory: str | None) -> bool:
    return _normalize_text(state_territory) in ILLINOIS_STATE_CODES


def is_cook_county(
    county_fips: str | None,
    counties_served: str | None,
) -> bool:
    """True when FIPS 17031 appears or counties_served names Cook."""
    for token in _parse_fips_tokens(county_fips):
        if token == COOK_COUNTY_FIPS or token.endswith(COOK_COUNTY_FIPS):
            return True

    served = _normalize_text(counties_served)
    if not served:
        return False
    return "cook" in served.split(",") or served == "cook"
