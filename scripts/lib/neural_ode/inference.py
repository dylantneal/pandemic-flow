"""Neural ODE rolling-origin forecasts and sub-week derivative samples."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

import torch

from scripts.lib.forecast_baselines import (
    DEFAULT_HORIZONS,
    ForecastPoint,
    ResidualStats,
    WeeklySeriesPoint,
    _make_forecast_point,
)
from scripts.lib.neural_ode.covariates import CovariateStats, origin_context_vector
from scripts.lib.neural_ode.dataset import (
    apply_baseline_anchor,
    build_baseline_anchor_series,
    standardize,
    unstandardize,
)
from scripts.lib.neural_ode.model import NeuralODE

DAILY_STEPS_PER_WEEK = 7
ROUND_DECIMALS = 4


@dataclass(frozen=True)
class DerivativeSample:
    horizon_weeks: int
    step_idx: int
    t_offset_days: float
    predicted_value: float
    predicted_derivative: float


@dataclass(frozen=True)
class OriginInferenceResult:
    forecast_origin_week: date
    origin_value: float
    forecasts: list[ForecastPoint]
    derivatives: list[DerivativeSample]


def _round4(value: float) -> float:
    return round(value, ROUND_DECIMALS)


def _anchor_interp(anchor_std: list[float], t_weeks: float) -> tuple[float, float]:
    """Piecewise-linear anchor value and slope at fractional week t."""
    max_h = len(anchor_std) - 1
    if max_h <= 0:
        return anchor_std[0], 0.0
    t = max(0.0, min(float(t_weeks), float(max_h)))
    i = min(int(t), max_h - 1)
    frac = t - i
    left = anchor_std[i]
    right = anchor_std[i + 1]
    value = (1.0 - frac) * left + frac * right
    slope = right - left
    return value, slope


def _correction_caps_by_horizon(model: NeuralODE) -> dict[int, float]:
    return {
        1: model.config.correction_cap_h1,
        2: model.config.correction_cap_h2,
        3: model.config.correction_cap_h3,
        4: model.config.correction_cap_h4,
    }


def _bounded_scalar_correction(
    correction_std: float,
    anchor_std: float,
    *,
    cap: float,
    mean: float,
    std: float,
    use_log_transform: bool,
) -> tuple[float, float]:
    """Return bounded standardized correction and derivative scale."""
    if not use_log_transform:
        delta = max(float(cap) / float(std), 1e-6)
    else:
        anchor_orig = max(math.expm1(anchor_std * float(std) + float(mean)), 0.0)
        if correction_std >= 0:
            upper_std = (math.log1p(anchor_orig + float(cap)) - float(mean)) / float(std)
            delta = max(upper_std - anchor_std, 1e-6)
        else:
            lower_orig = max(anchor_orig - float(cap), 0.0)
            lower_std = (math.log1p(lower_orig) - float(mean)) / float(std)
            delta = max(anchor_std - lower_std, 1e-6)
    ratio = correction_std / delta
    tanh_ratio = math.tanh(ratio)
    return delta * tanh_ratio, 1.0 - tanh_ratio * tanh_ratio


def forecast_at_origin(
    model: NeuralODE,
    history: list[WeeklySeriesPoint],
    origin_index: int,
    mean: float,
    std: float,
    *,
    horizons: tuple[int, ...] = DEFAULT_HORIZONS,
    residual_stats: ResidualStats | None = None,
    daily_steps_per_week: int = DAILY_STEPS_PER_WEEK,
    covariate_stats: CovariateStats | None = None,
    with_covariates: bool = False,
    region_key: str | None = None,
) -> OriginInferenceResult:
    """
    Integrate from origin week; emit weekly horizon forecasts and per-horizon
    derivative rows (step_idx 0..6, absolute t_offset_days).
    """
    origin = history[origin_index]
    origin_week = origin.week_start
    origin_value = origin.value
    stats = residual_stats or ResidualStats({})
    log_target = bool(model.config.log_target)

    x0_val = standardize(
        origin_value,
        mean,
        std,
        use_log_transform=log_target,
    )
    x0 = torch.tensor([[x0_val]], dtype=torch.float32)

    if with_covariates and covariate_stats is not None:
        ctx = origin_context_vector(origin, covariate_stats, region_key=region_key)
        model.set_context(origin_week_index=origin_index, origin_ctx=ctx)
    else:
        model.set_context(origin_week_index=origin_index, origin_ctx=None)

    # Sub-week grid: absolute days 1..(max_h * 7)
    max_h = max(horizons)
    t_days = [
        float((h - 1) * daily_steps_per_week + (step_idx + 1))
        for h in horizons
        for step_idx in range(daily_steps_per_week)
    ]
    t_weeks = torch.tensor([d / 7.0 for d in t_days], dtype=torch.float32)

    model.eval()
    with torch.no_grad():
        traj_state = model.forward_state(x0, t_weeks)
        traj_obs = model(x0, t_weeks)
        anchor_std: list[float] | None = None
        if model.config.baseline_anchor_head:
            anchor_raw = build_baseline_anchor_series(
                history,
                origin_index,
                max_horizon=max_h,
            )
            anchor_std = [
                standardize(
                    value,
                    mean,
                    std,
                    use_log_transform=log_target,
                )
                for value in anchor_raw
            ]

        forecasts: list[ForecastPoint] = []
        t_horizons = torch.tensor([float(h) for h in horizons], dtype=torch.float32)
        traj_weekly = model(x0, t_horizons)
        if model.config.baseline_anchor_head and anchor_std is not None:
            weekly_anchor_tensor = torch.tensor(
                [anchor_std[h] for h in horizons],
                dtype=torch.float32,
            ).reshape(-1, 1)
            gate_kwargs: dict = {}
            if model.config.correction_shrinkage_enabled and hasattr(
                model, "correction_gate_logits"
            ):
                gates = model.correction_gates(len(horizons))
                gate_kwargs["correction_gates"] = gates
            traj_weekly = apply_baseline_anchor(
                traj_weekly,
                x0,
                weekly_anchor_tensor,
                hard_bound=model.config.hard_correction_bound,
                caps_by_horizon=_correction_caps_by_horizon(model),
                horizon_numbers=horizons,
                mean=mean,
                std=std,
                use_log_transform=log_target,
                **gate_kwargs,
            )
        for i, h in enumerate(horizons):
            pred_std = float(traj_weekly[i, 0, 0].item())
            pred = unstandardize(
                pred_std,
                mean,
                std,
                use_log_transform=log_target,
            )
            forecasts.append(
                _make_forecast_point(
                    origin_week,
                    origin_value,
                    h,
                    pred,
                    stats.sigma(h),
                )
            )

        shrinkage_gates = None
        if model.config.correction_shrinkage_enabled and hasattr(
            model, "correction_gate_logits"
        ):
            shrinkage_gates = model.correction_gates(max(horizons))

        derivatives: list[DerivativeSample] = []
        offset = 0
        for h in horizons:
            for step_idx in range(daily_steps_per_week):
                state_std = traj_state[offset, 0, :].unsqueeze(0)
                t_week = t_weeks[offset]
                obs_std = float(traj_obs[offset, 0, 0].item())
                correction_std = obs_std - x0_val
                anchor_val_std = x0_val
                anchor_slope_std = 0.0
                correction_slope_factor = 1.0
                if model.config.baseline_anchor_head and anchor_std is not None:
                    anchor_val_std, anchor_slope_std = _anchor_interp(
                        anchor_std,
                        float(t_week.item()),
                    )
                    if model.config.hard_correction_bound:
                        cap = _correction_caps_by_horizon(model).get(h, model.config.correction_cap_value)
                        correction_std, correction_slope_factor = _bounded_scalar_correction(
                            correction_std,
                            anchor_val_std,
                            cap=cap,
                            mean=mean,
                            std=std,
                            use_log_transform=log_target,
                        )
                    if shrinkage_gates is not None:
                        gate = float(shrinkage_gates[h - 1].item())
                        correction_std *= gate
                        correction_slope_factor *= gate
                    obs_std = anchor_val_std + correction_std
                value = unstandardize(
                    obs_std,
                    mean,
                    std,
                    use_log_transform=log_target,
                )
                dz_std = model.derivative_observed_at(t_week, state_std)
                dz_dt_model_space = std * (
                    correction_slope_factor * float(dz_std[0, 0].item()) + anchor_slope_std
                )
                dx = (value + 1.0) * dz_dt_model_space if log_target else dz_dt_model_space
                derivatives.append(
                    DerivativeSample(
                        horizon_weeks=h,
                        step_idx=step_idx,
                        t_offset_days=t_days[offset],
                        predicted_value=_round4(value),
                        predicted_derivative=_round4(dx),
                    )
                )
                offset += 1

    return OriginInferenceResult(
        forecast_origin_week=origin_week,
        origin_value=origin_value,
        forecasts=forecasts,
        derivatives=derivatives,
    )
