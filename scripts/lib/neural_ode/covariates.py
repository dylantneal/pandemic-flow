"""Covariate extraction and standardization for Neural ODE (existing weekly columns only)."""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Sequence

import torch

from scripts.lib.forecast_baselines import WeeklySeriesPoint

# Frozen at origin: quality, active sites, population, week-over-week change
ORIGIN_COVARIATE_KEYS = (
    "quality_score",
    "active_site_count",
    "population_represented",
    "week_over_week_change",
)


@dataclass(frozen=True)
class CovariateStats:
    """Per-feature mean/std from training slice (for origin-frozen covariates)."""

    means: dict[str, float]
    stds: dict[str, float]
    region_keys: tuple[str, ...] = ()

    def standardize(self, key: str, value: float | None) -> float:
        if value is None:
            return 0.0
        mean = self.means.get(key, 0.0)
        std = self.stds.get(key, 1.0)
        if std <= 0:
            std = 1.0
        return (value - mean) / std


def fit_covariate_stats(
    history: Sequence[WeeklySeriesPoint],
    train_indices: Sequence[int],
) -> CovariateStats:
    means: dict[str, float] = {}
    stds: dict[str, float] = {}
    for key in ORIGIN_COVARIATE_KEYS:
        values: list[float] = []
        for i in train_indices:
            raw = getattr(history[i], key, None)
            if raw is not None:
                values.append(float(raw))
        if not values:
            means[key] = 0.0
            stds[key] = 1.0
            continue
        means[key] = statistics.mean(values)
        stds[key] = statistics.pstdev(values) if len(values) > 1 else 1.0
        if stds[key] <= 0:
            stds[key] = 1.0
    return CovariateStats(means=means, stds=stds)


def origin_context_vector(
    point: WeeklySeriesPoint,
    stats: CovariateStats,
    *,
    region_key: str | None = None,
) -> torch.Tensor:
    """Standardized origin-frozen features, shape (1, n_features)."""
    feats = [
        stats.standardize(key, getattr(point, key, None)) for key in ORIGIN_COVARIATE_KEYS
    ]
    if stats.region_keys:
        region_feats = [0.0] * len(stats.region_keys)
        if region_key is not None and region_key in stats.region_keys:
            region_feats[list(stats.region_keys).index(region_key)] = 1.0
        feats.extend(region_feats)
    return torch.tensor([feats], dtype=torch.float32)


def calendar_features_at_t(
    origin_week_index: int,
    t_weeks: float | torch.Tensor,
) -> tuple[float, float]:
    """Sin/cos of week-of-year along forecast path (52-week cycle)."""
    if isinstance(t_weeks, torch.Tensor):
        t_val = float(t_weeks.item())
    else:
        t_val = float(t_weeks)
    week_frac = ((origin_week_index + t_val) % 52.0) / 52.0
    angle = 2.0 * math.pi * week_frac
    return math.sin(angle), math.cos(angle)


def covariate_stats_to_dict(stats: CovariateStats) -> dict[str, object]:
    return {
        "means": dict(stats.means),
        "stds": dict(stats.stds),
        "region_keys": list(stats.region_keys),
    }


def covariate_stats_from_dict(data: dict[str, object]) -> CovariateStats:
    return CovariateStats(
        means=dict(data.get("means") or {}),
        stds=dict(data.get("stds") or {}),
        region_keys=tuple(data.get("region_keys") or []),
    )
