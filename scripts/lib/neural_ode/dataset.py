"""Dataset and train/val/holdout splits for weekly region series."""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Any, Sequence

import torch
from torch.utils.data import Dataset

from scripts.lib.forecast_baselines import (
    WeeklySeriesPoint,
    ensemble_forecast,
    moving_average_forecast,
    persistence_forecast,
    seasonal_naive_forecast,
    trend_forecast,
)
from scripts.lib.neural_ode.covariates import CovariateStats, origin_context_vector
from scripts.lib.neural_ode.metrics import is_turn_point_origin, trend_class_from_change

DEFAULT_HOLDOUT_WEEKS = 16
DEFAULT_VAL_WEEKS = 12
DEFAULT_MAX_HORIZON = 4


@dataclass(frozen=True)
class SeriesSplit:
    """Index boundaries for train / validation / holdout slices."""

    n: int
    train_end: int
    val_start: int
    val_end: int
    holdout_start: int

    @property
    def train_indices(self) -> list[int]:
        return list(range(0, self.train_end))

    @property
    def val_indices(self) -> list[int]:
        return list(range(self.val_start, self.val_end))

    @property
    def holdout_indices(self) -> list[int]:
        return list(range(self.holdout_start, self.n))


def compute_series_split(
    n: int,
    *,
    holdout_weeks: int = DEFAULT_HOLDOUT_WEEKS,
    val_weeks: int = DEFAULT_VAL_WEEKS,
) -> SeriesSplit:
    if n < holdout_weeks + val_weeks + 8:
        raise ValueError(
            f"Need at least {holdout_weeks + val_weeks + 8} weeks; got {n}"
        )
    holdout_start = n - holdout_weeks
    val_end = holdout_start
    val_start = max(0, val_end - val_weeks)
    train_end = val_start
    return SeriesSplit(
        n=n,
        train_end=train_end,
        val_start=val_start,
        val_end=val_end,
        holdout_start=holdout_start,
    )


def fit_standardization(
    history: Sequence[WeeklySeriesPoint],
    train_indices: Sequence[int],
    *,
    use_log_transform: bool = False,
) -> tuple[float, float]:
    values = [
        _to_model_space(history[i].value, use_log_transform=use_log_transform)
        for i in train_indices
    ]
    if not values:
        raise ValueError("train_indices must be non-empty")
    mean = statistics.mean(values)
    std = statistics.pstdev(values)
    if std <= 0:
        std = 1.0
    return mean, std


def _to_model_space(value: float, *, use_log_transform: bool) -> float:
    if not use_log_transform:
        return value
    return math.log1p(max(value, 0.0))


def _from_model_space(value: float, *, use_log_transform: bool) -> float:
    if not use_log_transform:
        return value
    return max(math.expm1(value), 0.0)


def standardize(
    value: float,
    mean: float,
    std: float,
    *,
    use_log_transform: bool = False,
) -> float:
    mapped = _to_model_space(value, use_log_transform=use_log_transform)
    return (mapped - mean) / std


def unstandardize(
    value: float,
    mean: float,
    std: float,
    *,
    use_log_transform: bool = False,
) -> float:
    mapped = value * std + mean
    return _from_model_space(mapped, use_log_transform=use_log_transform)


@dataclass(frozen=True)
class ForecastSample:
    origin_index: int
    x0: torch.Tensor
    t_eval: torch.Tensor
    y_target: torch.Tensor
    origin_ctx: torch.Tensor | None = None
    anchor_target: torch.Tensor | None = None
    region_key: str | None = None
    sample_weight: float = 1.0
    is_turn_point: bool = False
    actual_trend_class_h1: int = 1


def build_baseline_anchor_series(
    history: Sequence[WeeklySeriesPoint],
    origin_index: int,
    *,
    max_horizon: int = DEFAULT_MAX_HORIZON,
) -> list[float]:
    """
    Hybrid anchor for baseline-anchored training:
    - 1w uses persistence
    - 2w+ uses ensemble baseline
    """
    h = list(history)
    origin = h[origin_index]
    horizons = tuple(range(1, max_horizon + 1))
    persistence = persistence_forecast(h, origin_index, horizons=horizons)
    moving_avg = moving_average_forecast(h, origin_index, horizons=horizons)
    trend = trend_forecast(h, origin_index, horizons=horizons)
    seasonal = seasonal_naive_forecast(h, origin_index, horizons=horizons)
    ensemble = ensemble_forecast(
        [persistence, moving_avg, trend, seasonal],
        origin.value,
        origin.week_start,
    )

    p_by_h = {fp.horizon_weeks: fp.predicted_activity_index for fp in persistence}
    e_by_h = {fp.horizon_weeks: fp.predicted_activity_index for fp in ensemble}
    anchors = [origin.value]
    for week in horizons:
        if week == 1:
            anchors.append(float(p_by_h.get(1, origin.value)))
        else:
            anchors.append(float(e_by_h.get(week, origin.value)))
    return anchors


def apply_baseline_anchor(
    traj_std: torch.Tensor,
    x0_std: torch.Tensor,
    anchor_std: torch.Tensor | None,
    *,
    hard_bound: bool = False,
    caps_by_horizon: dict[int, float] | None = None,
    horizon_numbers: Sequence[int | float] | None = None,
    mean: float | None = None,
    std: float | None = None,
    use_log_transform: bool = False,
    correction_gates: torch.Tensor | None = None,
) -> torch.Tensor:
    """
    Map model trajectory to anchored output: anchor + gate * bounded_correction.

    When correction_gates is set, each horizon step is scaled by gate in [0, 1].
    Gate 0 recovers the anchor; gate 1 recovers the full bounded correction.
    """
    if anchor_std is None:
        return traj_std
    if anchor_std.dim() == 2:
        anchor = anchor_std.unsqueeze(1)
    else:
        anchor = anchor_std
    raw_correction = traj_std - x0_std.unsqueeze(0)
    if hard_bound:
        if mean is None or std is None:
            raise ValueError("mean and std are required for hard bounded corrections")
        bounded = _bounded_correction_std(
            raw_correction,
            anchor,
            caps_by_horizon=caps_by_horizon or {},
            horizon_numbers=horizon_numbers,
            mean=mean,
            std=std,
            use_log_transform=use_log_transform,
        )
    else:
        bounded = raw_correction
    if correction_gates is not None:
        g = correction_gates.reshape(-1, *([1] * (bounded.dim() - 1)))
        if g.shape[0] != bounded.shape[0]:
            raise ValueError("correction_gates must match trajectory horizon steps")
        bounded = bounded * g.to(device=bounded.device, dtype=bounded.dtype)
    return anchor + bounded


def correction_gate_abstention_penalty(
    model: Any,
    config: Any,
    *,
    max_horizons: int = 4,
) -> torch.Tensor:
    """Penalize open gates so corrections must earn their place on validation."""
    import torch

    if not hasattr(model, "correction_gate_logits"):
        return torch.tensor(0.0)
    gates = model.correction_gates(max_horizons)
    h1_w = float(getattr(config, "correction_gate_h1_penalty_weight", 2.0))
    med_w = float(
        getattr(config, "correction_gate_medium_horizon_penalty_weight", 1.75)
    )
    h4_w = getattr(config, "correction_gate_h4_penalty_weight", None)
    h4_w = float(h4_w) if h4_w is not None else med_w
    per_h = [h1_w, med_w, med_w, h4_w]
    weights = torch.tensor(
        per_h[: gates.numel()],
        dtype=gates.dtype,
        device=gates.device,
    )
    return (gates * weights).mean()


def _bounded_correction_std(
    correction_std: torch.Tensor,
    anchor_std: torch.Tensor,
    *,
    caps_by_horizon: dict[int, float],
    horizon_numbers: Sequence[int | float] | None,
    mean: float,
    std: float,
    use_log_transform: bool,
) -> torch.Tensor:
    """Bound anchor corrections by horizon in original activity-index units."""
    if correction_std.numel() == 0:
        return correction_std

    if horizon_numbers is None:
        horizon_ids = torch.arange(
            correction_std.shape[0],
            dtype=torch.float32,
            device=correction_std.device,
        ).clamp(min=1)
    else:
        horizon_ids = torch.tensor(
            [float(h) for h in horizon_numbers],
            dtype=torch.float32,
            device=correction_std.device,
        )
        if horizon_ids.numel() != correction_std.shape[0]:
            raise ValueError("horizon_numbers must match trajectory length")
    cap_values = [
        float(caps_by_horizon.get(max(1, int(round(float(h.item())))), caps_by_horizon.get(0, 0.7)))
        for h in horizon_ids
    ]
    cap = torch.tensor(
        cap_values,
        dtype=correction_std.dtype,
        device=correction_std.device,
    ).reshape(-1, *([1] * (correction_std.dim() - 1)))

    if not use_log_transform:
        cap_std = (cap / float(std)).clamp(min=1e-6)
        return cap_std * torch.tanh(correction_std / cap_std)

    anchor_model = anchor_std * float(std) + float(mean)
    anchor_orig = torch.expm1(anchor_model).clamp(min=0.0)
    upper_std = (torch.log1p(anchor_orig + cap) - float(mean)) / float(std)
    lower_orig = (anchor_orig - cap).clamp(min=0.0)
    lower_std = (torch.log1p(lower_orig) - float(mean)) / float(std)
    upper_delta = (upper_std - anchor_std).clamp(min=1e-6)
    lower_delta = (anchor_std - lower_std).clamp(min=1e-6)
    return torch.where(
        correction_std >= 0,
        upper_delta * torch.tanh(correction_std / upper_delta),
        lower_delta * torch.tanh(correction_std / lower_delta),
    )


class WeeklyRegionDataset(Dataset):
    """
    Sliding-origin samples for Neural ODE training.

    Each sample integrates from standardized x0 at origin week and predicts
    standardized values at t = 1..max_horizon weeks (loss ignores t=0).
    """

    def __init__(
        self,
        history: Sequence[WeeklySeriesPoint],
        origin_indices: Sequence[int],
        mean: float,
        std: float,
        *,
        max_horizon: int = DEFAULT_MAX_HORIZON,
        covariate_stats: CovariateStats | None = None,
        with_covariates: bool = False,
        use_log_transform: bool = False,
        region_key: str | None = None,
        with_baseline_anchor: bool = False,
        region_balance_weights: dict[str, float] | None = None,
        turn_point_margin: float = 0.10,
    ) -> None:
        self.history = list(history)
        self.mean = mean
        self.std = std
        self.max_horizon = max_horizon
        self.samples: list[ForecastSample] = []

        for origin in origin_indices:
            if origin + max_horizon >= len(self.history):
                continue
            pt = self.history[origin]
            x0_val = standardize(
                pt.value,
                mean,
                std,
                use_log_transform=use_log_transform,
            )
            targets = [
                standardize(
                    self.history[origin + h].value,
                    mean,
                    std,
                    use_log_transform=use_log_transform,
                )
                for h in range(max_horizon + 1)
            ]
            anchor_target = None
            if with_baseline_anchor:
                anchor_raw = build_baseline_anchor_series(
                    self.history,
                    origin,
                    max_horizon=max_horizon,
                )
                anchor_std = [
                    standardize(
                        value,
                        mean,
                        std,
                        use_log_transform=use_log_transform,
                    )
                    for value in anchor_raw
                ]
                anchor_target = torch.tensor(anchor_std, dtype=torch.float32).reshape(-1, 1)
            t_eval = torch.arange(0, max_horizon + 1, dtype=torch.float32)
            ctx = None
            if with_covariates and covariate_stats is not None:
                ctx = origin_context_vector(pt, covariate_stats, region_key=region_key)
            change_1w = self.history[origin + 1].value - pt.value
            weight = 1.0
            if region_key and region_balance_weights:
                weight = float(region_balance_weights.get(region_key, 1.0))
            self.samples.append(
                ForecastSample(
                    origin_index=origin,
                    x0=torch.tensor([[x0_val]], dtype=torch.float32),
                    t_eval=t_eval,
                    y_target=torch.tensor(targets, dtype=torch.float32).reshape(-1, 1),
                    origin_ctx=ctx,
                    anchor_target=anchor_target,
                    region_key=region_key,
                    sample_weight=weight,
                    is_turn_point=is_turn_point_origin(change_1w, margin=turn_point_margin),
                    actual_trend_class_h1=trend_class_from_change(change_1w),
                )
            )

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> ForecastSample:
        return self.samples[idx]
