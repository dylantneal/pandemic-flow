"""Compute weekly site and region metrics from clean observations."""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date
from typing import Any, Callable

TREND_RISING_THRESHOLD = 0.25
TREND_FALLING_THRESHOLD = -0.25
MIN_HISTORY_WEEKS = 2
MIN_STD = 1e-6

COOK_REGION_ID = "17031"
COOK_REGION_NAME = "Cook County, IL"
IL_REGION_ID = "IL"
IL_REGION_NAME = "Illinois"


def _parse_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    return float(statistics.median(values))


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return float(statistics.mean(values))


def _z_score(value: float, mean: float, std: float) -> float:
    if std < MIN_STD:
        return 0.0
    return (value - mean) / std


def _percentile_rank(value: float, history: list[float]) -> float:
    if not history:
        return 0.5
    below = sum(1 for h in history if h < value)
    equal = sum(1 for h in history if h == value)
    return (below + 0.5 * equal) / len(history)


def _trend_label(
    week_over_week_change: float | None,
    sample_count: int,
    history_weeks: int,
) -> str:
    if sample_count < 1 or history_weeks < MIN_HISTORY_WEEKS:
        return "insufficient_data"
    if week_over_week_change is None:
        return "insufficient_data"
    if week_over_week_change >= TREND_RISING_THRESHOLD:
        return "rising"
    if week_over_week_change <= TREND_FALLING_THRESHOLD:
        return "falling"
    return "stable"


def _weekly_quality_score(week: dict[str, Any]) -> float:
    score = float(week.get("obs_quality_mean") or 1.0)
    if week.get("sample_count", 0) < 2:
        score -= 0.15
    flags = week.get("quality_flags") or []
    if "below_lod" in flags:
        score -= 0.10
    if "inhibition_detected" in flags:
        score -= 0.10
    if "few_recent_samples" in flags:
        score -= 0.10
    return max(0.0, min(1.0, round(score, 4)))


def compute_site_weekly_rows(
    observations: list[dict[str, Any]],
    sites_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Aggregate observations to per-site per-week base metrics."""
    buckets: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)

    for obs in observations:
        site_id = obs.get("site_id")
        week_start = obs.get("week_start")
        log_c = obs.get("log_concentration")
        if not site_id or not week_start or log_c is None:
            continue
        buckets[(str(site_id), str(week_start))].append(obs)

    base_rows: list[dict[str, Any]] = []
    for (site_id, week_start), group in buckets.items():
        logs = [float(o["log_concentration"]) for o in group]
        q_scores = [
            float(o["quality_score"])
            for o in group
            if o.get("quality_score") is not None
        ]
        sample_dates = [_parse_date(o.get("sample_date")) for o in group]
        valid_dates = [d for d in sample_dates if d is not None]

        all_flags: list[str] = []
        for o in group:
            flags = o.get("quality_flags") or []
            if isinstance(flags, list):
                all_flags.extend(flags)

        site = sites_by_id.get(site_id, {})
        base_rows.append(
            {
                "site_id": site_id,
                "week_start": week_start,
                "state_territory": group[0].get("state_territory") or site.get("state_territory"),
                "county_fips": group[0].get("county_fips") or site.get("county_fips"),
                "sample_count": len(group),
                "median_log_concentration": _median(logs),
                "mean_log_concentration": _mean(logs),
                "latest_sample_date": max(valid_dates).isoformat() if valid_dates else None,
                "obs_quality_mean": _mean(q_scores),
                "quality_flags": list(dict.fromkeys(all_flags)),
            }
        )

    return enrich_site_weekly_metrics(base_rows)


def enrich_site_weekly_metrics(base_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add activity index, changes, trends, and weekly quality scores."""
    by_site: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in base_rows:
        by_site[row["site_id"]].append(row)

    enriched: list[dict[str, Any]] = []

    for _site_id, weeks in by_site.items():
        weeks.sort(key=lambda r: r["week_start"])
        history_medians = [
            float(w["median_log_concentration"])
            for w in weeks
            if w.get("median_log_concentration") is not None
        ]

        site_mean = _mean(history_medians) or 0.0
        site_std = (
            float(statistics.pstdev(history_medians))
            if len(history_medians) > 1
            else 0.0
        )

        activity_indices: list[float | None] = []
        for i, week in enumerate(weeks):
            median_log = week.get("median_log_concentration")
            activity_index: float | None = None

            if median_log is not None:
                if site_std >= MIN_STD and len(history_medians) >= MIN_HISTORY_WEEKS:
                    activity_index = _z_score(float(median_log), site_mean, site_std)
                else:
                    prior = history_medians[: i + 1]
                    activity_index = _percentile_rank(float(median_log), prior) * 2 - 1

            activity_indices.append(activity_index)
            week["activity_index"] = activity_index

        for i, week in enumerate(weeks):
            act = activity_indices[i]
            prev_1_act = activity_indices[i - 1] if i >= 1 else None
            prev_2_act = activity_indices[i - 2] if i >= 2 else None
            prev_4_act = activity_indices[i - 4] if i >= 4 else None

            wow = (
                act - prev_1_act
                if act is not None and prev_1_act is not None
                else None
            )
            week["week_over_week_change"] = wow
            week["two_week_change"] = (
                act - prev_2_act if act is not None and prev_2_act is not None else None
            )
            week["four_week_change"] = (
                act - prev_4_act if act is not None and prev_4_act is not None else None
            )

            med = week.get("median_log_concentration")
            prev_med = (
                weeks[i - 1].get("median_log_concentration") if i >= 1 else None
            )
            week["estimated_growth_rate"] = (
                float(med) - float(prev_med)
                if med is not None and prev_med is not None
                else None
            )

            week["trend_label"] = _trend_label(
                wow,
                week.get("sample_count", 0),
                len(history_medians),
            )
            week["quality_score"] = _weekly_quality_score(week)
            week.pop("obs_quality_mean", None)
            enriched.append(week)

    enriched.sort(key=lambda r: (r["site_id"], r["week_start"]))
    return enriched


def compute_region_weekly_metrics(
    site_weekly: list[dict[str, Any]],
    sites_by_id: dict[str, dict[str, Any]],
    *,
    region_type: str,
    region_id: str,
    region_name: str,
    site_filter: Callable[[dict[str, Any], dict[str, Any]], bool],
) -> list[dict[str, Any]]:
    """Aggregate site weekly metrics for a region (Cook County or Illinois)."""
    filtered = [
        row
        for row in site_weekly
        if site_filter(sites_by_id.get(row["site_id"], {}), row)
    ]

    by_week: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in filtered:
        by_week[str(row["week_start"])].append(row)

    region_rows: list[dict[str, Any]] = []
    sorted_weeks = sorted(by_week.keys())

    weighted_history: list[float] = []

    for week_start in sorted_weeks:
        group = by_week[week_start]
        activities = [
            float(r["activity_index"])
            for r in group
            if r.get("activity_index") is not None
        ]
        weights = []
        weighted_vals = []
        population = 0.0
        seen_sites: set[str] = set()

        for row in group:
            site = sites_by_id.get(row["site_id"], {})
            pop = site.get("population_served")
            act = row.get("activity_index")
            if act is not None:
                w = float(pop) if pop else 1.0
                weighted_vals.append(float(act) * w)
                weights.append(w)
            if pop and row["site_id"] not in seen_sites:
                population += float(pop)
                seen_sites.add(row["site_id"])

        active_count = len({r["site_id"] for r in group})

        weighted_activity = (
            sum(weighted_vals) / sum(weights) if weights and sum(weights) > 0 else None
        )
        median_activity = _median(activities)

        q_scores = [float(r["quality_score"]) for r in group if r.get("quality_score") is not None]
        all_flags: list[str] = []
        for r in group:
            flags = r.get("quality_flags") or []
            if isinstance(flags, list):
                all_flags.extend(flags)

        region_rows.append(
            {
                "region_type": region_type,
                "region_id": region_id,
                "region_name": region_name,
                "week_start": week_start,
                "site_count": len({r["site_id"] for r in group}),
                "active_site_count": active_count,
                "population_represented": population if population > 0 else None,
                "median_activity_index": median_activity,
                "weighted_activity_index": weighted_activity,
                "_activities": activities,
                "quality_score": _mean(q_scores),
                "quality_flags": list(dict.fromkeys(all_flags)),
            }
        )

    # Enrich with changes and trends on weighted_activity_index
    for i, row in enumerate(region_rows):
        w_act = row.get("weighted_activity_index")
        prev_w = (
            region_rows[i - 1].get("weighted_activity_index") if i >= 1 else None
        )
        wow = (
            w_act - prev_w if w_act is not None and prev_w is not None else None
        )
        row["week_over_week_change"] = wow
        row["estimated_growth_rate"] = wow
        row["trend_label"] = _trend_label(wow, row.get("site_count", 0), i + 1)
        row.pop("_activities", None)

    return region_rows


def cook_site_filter(site: dict[str, Any], row: dict[str, Any]) -> bool:
    return bool(site.get("is_cook_county_site")) or bool(row.get("is_cook_county"))


def illinois_site_filter(_site: dict[str, Any], _row: dict[str, Any]) -> bool:
    return True
