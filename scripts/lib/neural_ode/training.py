"""Train vanilla Neural ODE on a single region's weekly history."""

from __future__ import annotations

import copy
import logging
import random
import statistics
from dataclasses import dataclass, field
from typing import Any, Sequence

import torch
import torch.nn.functional as F

from scripts.lib.forecast_baselines import (
    TREND_FALLING_THRESHOLD,
    TREND_RISING_THRESHOLD,
    WeeklySeriesPoint,
    compute_residual_stats,
    trend_from_change,
)
from scripts.lib.neural_ode.covariates import (
    CovariateStats,
    fit_covariate_stats,
    origin_context_vector,
)
from scripts.lib.neural_ode.dataset import (
    DEFAULT_MAX_HORIZON,
    WeeklyRegionDataset,
    apply_baseline_anchor,
    build_baseline_anchor_series,
    correction_gate_abstention_penalty,
    compute_series_split,
    fit_standardization,
    standardize,
    unstandardize,
)
from scripts.lib.neural_ode.metrics import TrendDiagnostics, is_turn_point_origin
from scripts.lib.neural_ode.model import NeuralODE, NeuralOdeConfig, huber_loss, weighted_huber_loss

logger = logging.getLogger(__name__)

DEFAULT_EPOCHS = 800
DEFAULT_PATIENCE = 50
DEFAULT_LR = 1e-3
DEFAULT_WEIGHT_DECAY = 1e-5
DEFAULT_HORIZON_WEIGHTS: dict[int, float] = {1: 2.0, 2: 1.5, 3: 1.0, 4: 0.75}


@dataclass
class TrainResult:
    best_val_loss: float
    best_val_gate_score: float
    epochs_run: int
    mean: float
    std: float
    training_curve: list[dict[str, float]] = field(default_factory=list)
    holdout_metrics: dict[str, Any] = field(default_factory=dict)
    val_metrics: dict[str, Any] = field(default_factory=dict)
    trend_diagnostics: dict[str, Any] = field(default_factory=dict)
    model: NeuralODE | None = None
    covariate_stats: CovariateStats | None = None
    seed: int | None = None


@dataclass
class PooledTrainResult:
    best_val_loss: float
    best_val_gate_score: float
    epochs_run: int
    mean: float
    std: float
    training_curve: list[dict[str, float]] = field(default_factory=list)
    holdout_metrics_by_region: dict[str, dict[str, Any]] = field(default_factory=dict)
    val_metrics_by_region: dict[str, dict[str, Any]] = field(default_factory=dict)
    trend_diagnostics_by_region: dict[str, dict[str, Any]] = field(default_factory=dict)
    model: NeuralODE | None = None
    covariate_stats: CovariateStats | None = None
    seed: int | None = None


def _sample_effective_weight(sample: Any, config: NeuralOdeConfig) -> float:
    weight = float(getattr(sample, "sample_weight", 1.0))
    if getattr(sample, "is_turn_point", False) and config.turn_point_weight > 1.0:
        weight *= config.turn_point_weight
    return weight


def _balance_weights_from_counts(
    counts: dict[str, int],
    *,
    enabled: bool,
) -> dict[str, float]:
    if not enabled or not counts:
        return {}
    total = sum(counts.values())
    n_regions = len(counts)
    return {key: (total / (n_regions * count)) for key, count in counts.items()}


def _origins_with_horizon(
    indices: Sequence[int],
    history_len: int,
    max_horizon: int = DEFAULT_MAX_HORIZON,
) -> list[int]:
    return [i for i in indices if i + max_horizon < history_len]


def _horizon_weight_tensor(
    max_horizon: int,
    weights: dict[int, float] | None = None,
) -> torch.Tensor:
    w = weights or DEFAULT_HORIZON_WEIGHTS
    return torch.tensor(
        [w.get(h, 1.0) for h in range(1, max_horizon + 1)],
        dtype=torch.float32,
    )


def _apply_sample_context(
    model: NeuralODE,
    sample: Any,
    config: NeuralOdeConfig,
) -> None:
    if config.with_covariates:
        model.set_context(
            origin_week_index=sample.origin_index,
            origin_ctx=sample.origin_ctx,
        )
    else:
        model.set_context(origin_week_index=sample.origin_index, origin_ctx=None)


def _sample_loss(
    model: NeuralODE,
    sample: Any,
    config: NeuralOdeConfig,
    horizon_weights: torch.Tensor,
    *,
    mean: float,
    std: float,
) -> torch.Tensor:
    _apply_sample_context(model, sample, config)
    traj = model(sample.x0, sample.t_eval)
    traj = _apply_sample_anchor(traj, sample, model, config, mean=mean, std=std)
    loss = weighted_huber_loss(
        traj[1:],
        sample.y_target[1:],
        horizon_weights,
        delta=config.huber_delta,
    )
    if config.trend_loss_weight > 0.0:
        trend_loss = gate_consistent_trend_loss(
            traj,
            sample.y_target,
            mean=mean,
            std=std,
            use_log_transform=config.log_target,
            max_horizons=config.trend_loss_horizons,
            deadband=config.trend_loss_deadband,
            temperature=config.trend_loss_temperature,
        )
        loss = loss + config.trend_loss_weight * trend_loss
    if config.correction_cap_weight > 0.0 and config.baseline_anchor_head:
        cap_loss = correction_cap_penalty(
            traj,
            sample.anchor_target,
            mean=mean,
            std=std,
            use_log_transform=config.log_target,
            cap=config.correction_cap_value,
            caps_by_horizon=_correction_caps_by_horizon(config),
            max_horizons=config.correction_cap_horizons,
        )
        loss = loss + config.correction_cap_weight * cap_loss
    if config.correction_gate_penalty_weight > 0.0 and config.correction_shrinkage_enabled:
        gate_loss = correction_gate_abstention_penalty(model, config)
        loss = loss + config.correction_gate_penalty_weight * gate_loss
    weight = _sample_effective_weight(sample, config)
    if weight != 1.0:
        loss = loss * weight
    return loss


def _unstandardize_tensor(
    values: torch.Tensor,
    *,
    mean: float,
    std: float,
    use_log_transform: bool,
) -> torch.Tensor:
    mapped = values * float(std) + float(mean)
    if not use_log_transform:
        return mapped
    return torch.expm1(mapped).clamp(min=0.0)


def _trend_targets_from_change(change: torch.Tensor) -> torch.Tensor:
    targets = torch.ones_like(change, dtype=torch.long)
    targets = torch.where(
        change >= TREND_RISING_THRESHOLD,
        torch.full_like(targets, 2),
        targets,
    )
    targets = torch.where(
        change <= TREND_FALLING_THRESHOLD,
        torch.full_like(targets, 0),
        targets,
    )
    return targets


def _trend_logits_from_change(
    change: torch.Tensor,
    *,
    temperature: float,
) -> torch.Tensor:
    temp = max(float(temperature), 1e-6)
    rising_margin = (change - TREND_RISING_THRESHOLD) / temp
    falling_margin = (TREND_FALLING_THRESHOLD - change) / temp
    stable_margin = torch.minimum(
        TREND_RISING_THRESHOLD - change,
        change - TREND_FALLING_THRESHOLD,
    ) / temp
    return torch.stack([falling_margin, stable_margin, rising_margin], dim=-1)


def gate_consistent_trend_loss(
    pred_traj: torch.Tensor,
    target_traj: torch.Tensor,
    *,
    mean: float,
    std: float,
    use_log_transform: bool,
    max_horizons: int = 2,
    deadband: float = 0.0,
    temperature: float = 0.1,
) -> torch.Tensor:
    """
    Three-class trend loss tied to promotion thresholds:
    falling (<= -0.25), stable, rising (>= +0.25).
    """
    usable = min(max_horizons, pred_traj.shape[0] - 1, target_traj.shape[0] - 1)
    if usable <= 0:
        return pred_traj.new_zeros(())
    pred_orig = _unstandardize_tensor(
        pred_traj[: usable + 1],
        mean=mean,
        std=std,
        use_log_transform=use_log_transform,
    )
    target_orig = _unstandardize_tensor(
        target_traj[: usable + 1],
        mean=mean,
        std=std,
        use_log_transform=use_log_transform,
    )
    pred_change = pred_orig[1 : usable + 1] - pred_orig[0:1]
    target_change = target_orig[1 : usable + 1] - target_orig[0:1]

    logits = _trend_logits_from_change(pred_change, temperature=temperature).reshape(-1, 3)
    targets = _trend_targets_from_change(target_change).reshape(-1)
    ce = F.cross_entropy(logits, targets, reduction="none")
    if deadband <= 0.0:
        return ce.mean()
    distance_to_boundary = torch.minimum(
        (target_change - TREND_FALLING_THRESHOLD).abs(),
        (target_change - TREND_RISING_THRESHOLD).abs(),
    ).reshape(-1)
    weights = torch.clamp(distance_to_boundary / float(deadband), max=1.0)
    return (ce * weights).sum() / weights.sum().clamp(min=1e-8)


def correction_cap_penalty(
    pred_traj: torch.Tensor,
    anchor_target: torch.Tensor | None,
    *,
    mean: float,
    std: float,
    use_log_transform: bool,
    cap: float = 0.7,
    caps_by_horizon: dict[int, float] | None = None,
    max_horizons: int = 2,
) -> torch.Tensor:
    """Soft-penalize anchor correction magnitude when it exceeds a threshold."""
    if anchor_target is None:
        return pred_traj.new_zeros(())
    anchor = anchor_target.unsqueeze(1) if anchor_target.dim() == 2 else anchor_target
    usable = min(max_horizons, pred_traj.shape[0] - 1, anchor.shape[0] - 1)
    if usable <= 0:
        return pred_traj.new_zeros(())
    pred_orig = _unstandardize_tensor(
        pred_traj[1 : usable + 1],
        mean=mean,
        std=std,
        use_log_transform=use_log_transform,
    )
    anchor_orig = _unstandardize_tensor(
        anchor[1 : usable + 1],
        mean=mean,
        std=std,
        use_log_transform=use_log_transform,
    )
    correction = pred_orig - anchor_orig
    penalties: list[torch.Tensor] = []
    for h in range(1, usable + 1):
        cap_h = float((caps_by_horizon or {}).get(h, cap))
        excess = torch.relu(correction[h - 1 : h].abs() - cap_h)
        penalties.append(excess**2)
    return torch.cat(penalties).mean()


def _correction_caps_by_horizon(config: NeuralOdeConfig) -> dict[int, float]:
    return {
        1: config.correction_cap_h1,
        2: config.correction_cap_h2,
        3: config.correction_cap_h3,
        4: config.correction_cap_h4,
    }


def _anchor_kwargs(
    config: NeuralOdeConfig,
    *,
    mean: float,
    std: float,
    model: NeuralODE | None = None,
    n_horizon_steps: int | None = None,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "hard_bound": config.hard_correction_bound,
        "caps_by_horizon": _correction_caps_by_horizon(config),
        "mean": mean,
        "std": std,
        "use_log_transform": config.log_target,
    }
    if (
        config.correction_shrinkage_enabled
        and model is not None
        and n_horizon_steps is not None
        and hasattr(model, "correction_gate_logits")
    ):
        max_h = max(int(n_horizon_steps) - 1, 1)
        kwargs["correction_gates"] = _correction_gates_for_traj(
            model, max_h, traj_len=int(n_horizon_steps)
        )
    return kwargs


def _correction_gates_for_traj(
    model: NeuralODE,
    max_horizon: int,
    *,
    traj_len: int,
) -> torch.Tensor:
    """Map per-horizon gates onto trajectory steps (t=0 stays ungated / abstained)."""
    gates = model.correction_gates(max_horizon)
    if traj_len <= gates.numel():
        return gates[:traj_len]
    pad = torch.zeros(
        traj_len - gates.numel(),
        dtype=gates.dtype,
        device=gates.device,
    )
    return torch.cat([pad, gates], dim=0)


def _apply_sample_anchor(
    traj: torch.Tensor,
    sample: Any,
    model: NeuralODE,
    config: NeuralOdeConfig,
    *,
    mean: float,
    std: float,
) -> torch.Tensor:
    return apply_baseline_anchor(
        traj,
        sample.x0,
        sample.anchor_target if config.baseline_anchor_head else None,
        **_anchor_kwargs(
            config,
            mean=mean,
            std=std,
            model=model,
            n_horizon_steps=traj.shape[0],
        ),
    )


def _epoch_loss(
    model: NeuralODE,
    dataset: WeeklyRegionDataset,
    config: NeuralOdeConfig,
    horizon_weights: torch.Tensor,
    *,
    mean: float,
    std: float,
) -> float:
    if len(dataset) == 0:
        return float("inf")
    total = 0.0
    model.eval()
    with torch.no_grad():
        for idx in range(len(dataset)):
            total += _sample_loss(
                model,
                dataset[idx],
                config,
                horizon_weights,
                mean=mean,
                std=std,
            ).item()
    return total / len(dataset)


def _train_epoch(
    model: NeuralODE,
    dataset: WeeklyRegionDataset,
    optimizer: torch.optim.Optimizer,
    config: NeuralOdeConfig,
    horizon_weights: torch.Tensor,
    *,
    mean: float,
    std: float,
) -> float:
    model.train()
    indices = list(range(len(dataset)))
    random.shuffle(indices)
    total = 0.0
    for idx in indices:
        loss = _sample_loss(
            model,
            dataset[idx],
            config,
            horizon_weights,
            mean=mean,
            std=std,
        )
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        total += loss.item()
    return total / max(len(indices), 1)


def _predicted_trend(origin_value: float, pred: float) -> str:
    return trend_from_change(pred - origin_value)


def evaluate_holdout(
    model: NeuralODE,
    history: Sequence[WeeklySeriesPoint],
    holdout_indices: Sequence[int],
    mean: float,
    std: float,
    *,
    config: NeuralOdeConfig | None = None,
    covariate_stats: CovariateStats | None = None,
    region_key: str | None = None,
    max_horizon: int = DEFAULT_MAX_HORIZON,
) -> dict[str, Any]:
    """Rolling-origin MAE/RMSE/trend on holdout weeks (de-standardized)."""
    node_config = config or NeuralOdeConfig()
    model.eval()
    errors_by_horizon: dict[int, list[float]] = {h: [] for h in range(1, max_horizon + 1)}
    trend_correct_1w: list[bool] = []

    with torch.no_grad():
        for origin in _origins_with_horizon(holdout_indices, len(history), max_horizon):
            origin_pt = history[origin]
            x0_val = standardize(
                origin_pt.value,
                mean,
                std,
                use_log_transform=node_config.log_target,
            )
            x0 = torch.tensor([[x0_val]], dtype=torch.float32)
            if node_config.with_covariates and covariate_stats is not None:
                ctx = origin_context_vector(
                    origin_pt,
                    covariate_stats,
                    region_key=region_key,
                )
                model.set_context(origin_week_index=origin, origin_ctx=ctx)
            else:
                model.set_context(origin_week_index=origin, origin_ctx=None)

            t_eval = torch.arange(0, max_horizon + 1, dtype=torch.float32)
            traj = model(x0, t_eval)
            if node_config.baseline_anchor_head:
                anchor_raw = build_baseline_anchor_series(
                    history,
                    origin,
                    max_horizon=max_horizon,
                )
                anchor_std = torch.tensor(
                    [
                        standardize(
                            v,
                            mean,
                            std,
                            use_log_transform=node_config.log_target,
                        )
                        for v in anchor_raw
                    ],
                    dtype=torch.float32,
                ).reshape(-1, 1)
                traj = apply_baseline_anchor(
                    traj,
                    x0,
                    anchor_std,
                    **_anchor_kwargs(
                        node_config,
                        mean=mean,
                        std=std,
                        model=model,
                        n_horizon_steps=traj.shape[0],
                    ),
                )
            origin_value = origin_pt.value

            for h in range(1, max_horizon + 1):
                pred = unstandardize(
                    float(traj[h, 0, 0].item()),
                    mean,
                    std,
                    use_log_transform=node_config.log_target,
                )
                actual = history[origin + h].value
                errors_by_horizon[h].append(abs(pred - actual))
                if h == 1:
                    pred_trend = _predicted_trend(origin_value, pred)
                    actual_trend = _predicted_trend(
                        origin_value,
                        history[origin + 1].value,
                    )
                    if (
                        pred_trend != "insufficient_data"
                        and actual_trend != "insufficient_data"
                    ):
                        trend_correct_1w.append(pred_trend == actual_trend)

    by_horizon: dict[str, dict[str, float | int | None]] = {}
    for h, errs in errors_by_horizon.items():
        if not errs:
            continue
        mae = statistics.mean(errs)
        rmse = (statistics.mean([e * e for e in errs])) ** 0.5
        block: dict[str, float | int | None] = {
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "n_evaluations": len(errs),
        }
        if h == 1 and trend_correct_1w:
            block["trend_accuracy"] = round(
                sum(1 for t in trend_correct_1w if t) / len(trend_correct_1w),
                4,
            )
        by_horizon[str(h)] = block

    residual = compute_residual_stats(errors_by_horizon)
    trend_diag = _trend_diagnostics_from_holdout(
        history,
        holdout_indices,
        model,
        mean,
        std,
        config=node_config,
        covariate_stats=covariate_stats,
        region_key=region_key,
        max_horizon=max_horizon,
    )
    payload: dict[str, Any] = {
        "by_horizon": by_horizon,
        "total_evaluations": sum(len(v) for v in errors_by_horizon.values()),
        "residual_sigma_by_horizon": {
            str(k): round(v, 4) for k, v in residual.by_horizon.items()
        },
        "trend_diagnostics_1w": trend_diag.to_dict(),
    }
    if hasattr(model, "correction_gate_logits"):
        from scripts.lib.neural_ode.gates import correction_gates_metrics_dict

        payload.update(correction_gates_metrics_dict(model, max_horizons=max_horizon))
    return payload


def _trend_diagnostics_from_holdout(
    history: Sequence[WeeklySeriesPoint],
    holdout_indices: Sequence[int],
    model: NeuralODE,
    mean: float,
    std: float,
    *,
    config: NeuralOdeConfig,
    covariate_stats: CovariateStats | None,
    region_key: str | None,
    max_horizon: int,
) -> TrendDiagnostics:
    """1w trend confusion on holdout origins (de-standardized)."""
    confusion: dict[str, int] = {
        f"{a}->{b}": 0
        for a in ("falling", "stable", "rising")
        for b in ("falling", "stable", "rising")
    }
    turn_total = 0
    turn_correct = 0
    n_eval = 0

    model.eval()
    with torch.no_grad():
        for origin in _origins_with_horizon(holdout_indices, len(history), max_horizon):
            origin_pt = history[origin]
            x0_val = standardize(
                origin_pt.value,
                mean,
                std,
                use_log_transform=config.log_target,
            )
            x0 = torch.tensor([[x0_val]], dtype=torch.float32)
            if config.with_covariates and covariate_stats is not None:
                ctx = origin_context_vector(
                    origin_pt,
                    covariate_stats,
                    region_key=region_key,
                )
                model.set_context(origin_week_index=origin, origin_ctx=ctx)
            else:
                model.set_context(origin_week_index=origin, origin_ctx=None)

            t_eval = torch.arange(0, max_horizon + 1, dtype=torch.float32)
            traj = model(x0, t_eval)
            if config.baseline_anchor_head:
                anchor_raw = build_baseline_anchor_series(history, origin, max_horizon=max_horizon)
                anchor_std = torch.tensor(
                    [
                        standardize(v, mean, std, use_log_transform=config.log_target)
                        for v in anchor_raw
                    ],
                    dtype=torch.float32,
                ).reshape(-1, 1)
                traj = apply_baseline_anchor(
                    traj,
                    x0,
                    anchor_std,
                    **_anchor_kwargs(
                        config,
                        mean=mean,
                        std=std,
                        model=model,
                        n_horizon_steps=traj.shape[0],
                    ),
                )

            pred = unstandardize(
                float(traj[1, 0, 0].item()),
                mean,
                std,
                use_log_transform=config.log_target,
            )
            actual = history[origin + 1].value
            change = actual - origin_pt.value
            actual_trend = trend_from_change(change)
            pred_trend = trend_from_change(pred - origin_pt.value)
            if actual_trend == "insufficient_data" or pred_trend == "insufficient_data":
                continue
            key = f"{actual_trend}->{pred_trend}"
            if key in confusion:
                confusion[key] += 1
            n_eval += 1
            if is_turn_point_origin(change, margin=config.turn_point_margin):
                turn_total += 1
                if pred_trend == actual_trend:
                    turn_correct += 1

    diag = TrendDiagnostics(
        confusion=confusion,
        turn_point_total=turn_total,
        turn_point_correct=turn_correct,
        n_evaluations=n_eval,
    )
    return diag


def _anchor_value_std(
    anchor_target: torch.Tensor,
    horizon: int,
) -> float:
    """Read standardized anchor at horizon index from dataset anchor tensor."""
    if anchor_target.dim() == 2:
        return float(anchor_target[horizon, 0].item())
    return float(anchor_target[horizon, 0, 0].item())


def _compose_val_gate_score(
    mae_by_h: dict[int, list[float]],
    anchor_mae_by_h: dict[int, list[float]],
    trend_correct: list[bool],
    *,
    config: NeuralOdeConfig,
    gate_penalty: float = 0.0,
) -> float:
    """
    Validation score: model MAE + excess over anchor + open-gate penalty.
    Lower is better. Anchor MAE uses the ensemble/persistence baseline head.
    """
    mae1 = statistics.mean(mae_by_h[1]) if mae_by_h[1] else 999.0
    mae2 = statistics.mean(mae_by_h[2]) if mae_by_h[2] else 999.0
    trend_penalty = (
        1.0 - (sum(1 for x in trend_correct if x) / len(trend_correct))
        if trend_correct
        else 1.0
    )
    excess1 = 0.0
    excess2 = 0.0
    if anchor_mae_by_h[1]:
        excess1 = max(0.0, mae1 - statistics.mean(anchor_mae_by_h[1]))
    if anchor_mae_by_h[2]:
        excess2 = max(0.0, mae2 - statistics.mean(anchor_mae_by_h[2]))
    return (
        2.0 * mae1
        + 1.5 * mae2
        + config.val_gate_trend_weight * trend_penalty
        + config.val_gate_excess_weight * (2.0 * excess1 + 1.5 * excess2)
        + config.val_gate_open_gate_weight * gate_penalty
    )


def _val_gate_score(
    model: NeuralODE,
    dataset: WeeklyRegionDataset,
    mean: float,
    std: float,
    *,
    config: NeuralOdeConfig,
    covariate_stats: CovariateStats | None = None,
    max_horizon: int = DEFAULT_MAX_HORIZON,
) -> float:
    """De-standardized composite aligned with promotion (1w/2w MAE emphasis). Lower is better."""
    if len(dataset) == 0:
        return float("inf")

    mae_by_h: dict[int, list[float]] = {1: [], 2: []}
    anchor_mae_by_h: dict[int, list[float]] = {1: [], 2: []}
    trend_correct: list[bool] = []
    model.eval()
    with torch.no_grad():
        for idx in range(len(dataset)):
            sample = dataset[idx]
            origin = sample.origin_index
            origin_value = dataset.history[origin].value
            _apply_sample_context(model, sample, config)
            t_eval = torch.arange(0, max_horizon + 1, dtype=torch.float32)
            traj = model(sample.x0, t_eval)
            traj = _apply_sample_anchor(traj, sample, model, config, mean=mean, std=std)
            for h in (1, 2):
                if h > max_horizon:
                    continue
                pred = unstandardize(
                    float(traj[h, 0, 0].item()),
                    mean,
                    std,
                    use_log_transform=config.log_target,
                )
                actual = dataset.history[origin + h].value
                mae_by_h[h].append(abs(pred - actual))
                if config.baseline_anchor_head and sample.anchor_target is not None:
                    anchor_pred = unstandardize(
                        _anchor_value_std(sample.anchor_target, h),
                        mean,
                        std,
                        use_log_transform=config.log_target,
                    )
                    anchor_mae_by_h[h].append(abs(anchor_pred - actual))
                if h == 1:
                    pred_trend = trend_from_change(pred - origin_value)
                    actual_trend = trend_from_change(actual - origin_value)
                    if (
                        pred_trend != "insufficient_data"
                        and actual_trend != "insufficient_data"
                    ):
                        trend_correct.append(pred_trend == actual_trend)

    gate_penalty = 0.0
    if config.correction_shrinkage_enabled and hasattr(model, "correction_gate_logits"):
        gate_penalty = float(
            correction_gate_abstention_penalty(model, config).item()
        )
    return _compose_val_gate_score(
        mae_by_h,
        anchor_mae_by_h,
        trend_correct,
        config=config,
        gate_penalty=gate_penalty,
    )


def train_one_region(
    history: list[WeeklySeriesPoint],
    *,
    config: NeuralOdeConfig | None = None,
    max_epochs: int = DEFAULT_EPOCHS,
    patience: int = DEFAULT_PATIENCE,
    lr: float = DEFAULT_LR,
    weight_decay: float = DEFAULT_WEIGHT_DECAY,
    max_horizon: int = DEFAULT_MAX_HORIZON,
    horizon_weights: dict[int, float] | None = None,
    seed: int | None = None,
) -> TrainResult:
    """
    Fit Neural ODE on train slice; early-stop on gate-aligned validation score.
    Returns best model state (in-memory) and holdout metrics snapshot.
    """
    if len(history) < 36:
        raise ValueError(f"Need at least 36 weeks of history; got {len(history)}")

    node_config = config or NeuralOdeConfig()
    split = compute_series_split(len(history))
    mean, std = fit_standardization(
        history,
        split.train_indices,
        use_log_transform=node_config.log_target,
    )
    cov_stats: CovariateStats | None = None
    if node_config.with_covariates:
        cov_stats = fit_covariate_stats(history, split.train_indices)

    train_origins = _origins_with_horizon(split.train_indices, len(history), max_horizon)
    val_origins = _origins_with_horizon(split.val_indices, len(history), max_horizon)
    holdout_origins = _origins_with_horizon(split.holdout_indices, len(history), max_horizon)

    train_ds = WeeklyRegionDataset(
        history,
        train_origins,
        mean,
        std,
        max_horizon=max_horizon,
        covariate_stats=cov_stats,
        with_covariates=node_config.with_covariates,
        use_log_transform=node_config.log_target,
        with_baseline_anchor=node_config.baseline_anchor_head,
    )
    val_ds = WeeklyRegionDataset(
        history,
        val_origins,
        mean,
        std,
        max_horizon=max_horizon,
        covariate_stats=cov_stats,
        with_covariates=node_config.with_covariates,
        use_log_transform=node_config.log_target,
        with_baseline_anchor=node_config.baseline_anchor_head,
    )

    if len(train_ds) == 0:
        raise ValueError("No training samples after split")

    h_weights = _horizon_weight_tensor(max_horizon, horizon_weights)
    model = NeuralODE(node_config)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer,
        T_max=max(max_epochs, 1),
        eta_min=lr * 0.05,
    )

    best_val_gate = float("inf")
    best_val_huber = float("inf")
    best_state: dict[str, Any] | None = None
    stale = 0
    curve: list[dict[str, float]] = []

    for epoch in range(1, max_epochs + 1):
        train_loss = _train_epoch(
            model,
            train_ds,
            optimizer,
            node_config,
            h_weights,
            mean=mean,
            std=std,
        )
        val_huber = _epoch_loss(
            model,
            val_ds,
            node_config,
            h_weights,
            mean=mean,
            std=std,
        )
        val_gate = _val_gate_score(
            model,
            val_ds,
            mean,
            std,
            config=node_config,
            covariate_stats=cov_stats,
            max_horizon=max_horizon,
        )
        scheduler.step()
        curve.append(
            {
                "epoch": float(epoch),
                "train_loss": round(train_loss, 6),
                "val_loss": round(val_huber, 6),
                "val_gate_score": round(val_gate, 6),
            }
        )

        if val_gate < best_val_gate - 1e-8:
            best_val_gate = val_gate
            best_val_huber = val_huber
            best_state = copy.deepcopy(model.state_dict())
            stale = 0
        else:
            stale += 1

        if epoch % 50 == 0 or epoch == 1:
            logger.info(
                "Epoch %d/%d train_loss=%.6f val_huber=%.6f val_gate=%.6f (best_gate=%.6f)",
                epoch,
                max_epochs,
                train_loss,
                val_huber,
                val_gate,
                best_val_gate,
            )

        if stale >= patience:
            logger.info("Early stopping at epoch %d (patience=%d)", epoch, patience)
            break

    if best_state is not None:
        model.load_state_dict(best_state)

    holdout_metrics = evaluate_holdout(
        model,
        history,
        holdout_origins,
        mean,
        std,
        config=node_config,
        covariate_stats=cov_stats,
        max_horizon=max_horizon,
    )

    return TrainResult(
        best_val_loss=best_val_huber,
        best_val_gate_score=best_val_gate,
        epochs_run=len(curve),
        mean=mean,
        std=std,
        training_curve=curve,
        holdout_metrics=holdout_metrics,
        model=model,
        covariate_stats=cov_stats,
        seed=seed,
    )


def _pooled_epoch_loss(
    model: NeuralODE,
    datasets: Sequence[WeeklyRegionDataset],
    config: NeuralOdeConfig,
    horizon_weights: torch.Tensor,
    *,
    mean: float,
    std: float,
) -> float:
    counts = [len(ds) for ds in datasets]
    total_n = sum(counts)
    if total_n == 0:
        return float("inf")
    total = 0.0
    model.eval()
    with torch.no_grad():
        for ds in datasets:
            for idx in range(len(ds)):
                total += _sample_loss(
                    model,
                    ds[idx],
                    config,
                    horizon_weights,
                    mean=mean,
                    std=std,
                ).item()
    return total / total_n


def _pooled_train_epoch(
    model: NeuralODE,
    datasets: Sequence[WeeklyRegionDataset],
    optimizer: torch.optim.Optimizer,
    config: NeuralOdeConfig,
    horizon_weights: torch.Tensor,
    *,
    mean: float,
    std: float,
) -> float:
    pool: list[tuple[int, int]] = []
    for ds_idx, ds in enumerate(datasets):
        for idx in range(len(ds)):
            pool.append((ds_idx, idx))
    if not pool:
        return float("inf")
    random.shuffle(pool)
    model.train()
    total = 0.0
    for ds_idx, idx in pool:
        loss = _sample_loss(
            model,
            datasets[ds_idx][idx],
            config,
            horizon_weights,
            mean=mean,
            std=std,
        )
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        total += loss.item()
    return total / len(pool)


def _pooled_val_gate_score(
    model: NeuralODE,
    datasets: Sequence[WeeklyRegionDataset],
    mean: float,
    std: float,
    *,
    config: NeuralOdeConfig,
    max_horizon: int = DEFAULT_MAX_HORIZON,
) -> float:
    region_scores: list[float] = []
    model.eval()
    with torch.no_grad():
        for dataset in datasets:
            if len(dataset) == 0:
                continue
            mae_by_h: dict[int, list[float]] = {1: [], 2: []}
            anchor_mae_by_h: dict[int, list[float]] = {1: [], 2: []}
            trend_correct: list[bool] = []
            for idx in range(len(dataset)):
                sample = dataset[idx]
                origin = sample.origin_index
                origin_value = dataset.history[origin].value
                _apply_sample_context(model, sample, config)
                t_eval = torch.arange(0, max_horizon + 1, dtype=torch.float32)
                traj = model(sample.x0, t_eval)
                traj = _apply_sample_anchor(traj, sample, model, config, mean=mean, std=std)
                for h in (1, 2):
                    if h > max_horizon:
                        continue
                    pred = unstandardize(
                        float(traj[h, 0, 0].item()),
                        mean,
                        std,
                        use_log_transform=config.log_target,
                    )
                    actual = dataset.history[origin + h].value
                    mae_by_h[h].append(abs(pred - actual))
                    if config.baseline_anchor_head and sample.anchor_target is not None:
                        anchor_pred = unstandardize(
                            _anchor_value_std(sample.anchor_target, h),
                            mean,
                            std,
                            use_log_transform=config.log_target,
                        )
                        anchor_mae_by_h[h].append(abs(anchor_pred - actual))
                    if h == 1:
                        pred_trend = trend_from_change(pred - origin_value)
                        actual_trend = trend_from_change(actual - origin_value)
                        if (
                            pred_trend != "insufficient_data"
                            and actual_trend != "insufficient_data"
                        ):
                            trend_correct.append(pred_trend == actual_trend)
            region_scores.append(
                _compose_val_gate_score(
                    mae_by_h,
                    anchor_mae_by_h,
                    trend_correct,
                    config=config,
                    gate_penalty=0.0,
                )
            )
    gate_penalty = 0.0
    if config.correction_shrinkage_enabled and hasattr(model, "correction_gate_logits"):
        gate_penalty = float(
            correction_gate_abstention_penalty(model, config).item()
        )
    if not region_scores:
        return float("inf")
    base = statistics.mean(region_scores)
    return base + config.val_gate_open_gate_weight * gate_penalty


def train_pooled_regions(
    histories_by_region: dict[str, list[WeeklySeriesPoint]],
    *,
    config: NeuralOdeConfig,
    max_epochs: int = DEFAULT_EPOCHS,
    patience: int = DEFAULT_PATIENCE,
    lr: float = DEFAULT_LR,
    weight_decay: float = DEFAULT_WEIGHT_DECAY,
    max_horizon: int = DEFAULT_MAX_HORIZON,
    horizon_weights: dict[int, float] | None = None,
    seed: int | None = None,
) -> PooledTrainResult:
    """Train one shared model across regions with region-conditioned context."""
    if not config.with_covariates:
        raise ValueError("pooled training requires with_covariates=True")
    if len(histories_by_region) < 2:
        raise ValueError("pooled training requires at least two regions")

    for region_key, history in histories_by_region.items():
        if len(history) < 36:
            raise ValueError(f"{region_key}: need at least 36 weeks; got {len(history)}")

    splits = {
        region_key: compute_series_split(len(history))
        for region_key, history in histories_by_region.items()
    }

    pooled_train_points: list[WeeklySeriesPoint] = []
    for region_key, history in histories_by_region.items():
        pooled_train_points.extend(history[i] for i in splits[region_key].train_indices)

    mean, std = fit_standardization(
        pooled_train_points,
        list(range(len(pooled_train_points))),
        use_log_transform=config.log_target,
    )
    base_cov = fit_covariate_stats(
        pooled_train_points,
        list(range(len(pooled_train_points))),
    )
    cov_stats = CovariateStats(
        means=base_cov.means,
        stds=base_cov.stds,
        region_keys=tuple(histories_by_region.keys()),
    )

    train_datasets: list[WeeklyRegionDataset] = []
    val_datasets: list[WeeklyRegionDataset] = []
    holdout_origins_by_region: dict[str, list[int]] = {}
    train_counts: dict[str, int] = {}
    for region_key, history in histories_by_region.items():
        split = splits[region_key]
        train_origins = _origins_with_horizon(split.train_indices, len(history), max_horizon)
        val_origins = _origins_with_horizon(split.val_indices, len(history), max_horizon)
        holdout_origins = _origins_with_horizon(split.holdout_indices, len(history), max_horizon)
        holdout_origins_by_region[region_key] = holdout_origins
        train_counts[region_key] = len(train_origins)

    balance_weights = _balance_weights_from_counts(
        train_counts,
        enabled=config.region_balance_weight > 0,
    )

    for region_key, history in histories_by_region.items():
        split = splits[region_key]
        train_origins = _origins_with_horizon(split.train_indices, len(history), max_horizon)
        val_origins = _origins_with_horizon(split.val_indices, len(history), max_horizon)

        train_datasets.append(
            WeeklyRegionDataset(
                history,
                train_origins,
                mean,
                std,
                max_horizon=max_horizon,
                covariate_stats=cov_stats,
                with_covariates=True,
                use_log_transform=config.log_target,
                region_key=region_key,
                with_baseline_anchor=config.baseline_anchor_head,
                region_balance_weights=balance_weights,
                turn_point_margin=config.turn_point_margin,
            )
        )
        val_datasets.append(
            WeeklyRegionDataset(
                history,
                val_origins,
                mean,
                std,
                max_horizon=max_horizon,
                covariate_stats=cov_stats,
                with_covariates=True,
                use_log_transform=config.log_target,
                region_key=region_key,
                with_baseline_anchor=config.baseline_anchor_head,
                turn_point_margin=config.turn_point_margin,
            )
        )

    if sum(len(ds) for ds in train_datasets) == 0:
        raise ValueError("No pooled training samples after split")

    h_weights = _horizon_weight_tensor(max_horizon, horizon_weights)
    model = NeuralODE(config)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer,
        T_max=max(max_epochs, 1),
        eta_min=lr * 0.05,
    )

    best_val_gate = float("inf")
    best_val_huber = float("inf")
    best_state: dict[str, Any] | None = None
    stale = 0
    curve: list[dict[str, float]] = []

    for epoch in range(1, max_epochs + 1):
        train_loss = _pooled_train_epoch(
            model,
            train_datasets,
            optimizer,
            config,
            h_weights,
            mean=mean,
            std=std,
        )
        val_huber = _pooled_epoch_loss(
            model,
            val_datasets,
            config,
            h_weights,
            mean=mean,
            std=std,
        )
        val_gate = _pooled_val_gate_score(
            model,
            val_datasets,
            mean,
            std,
            config=config,
            max_horizon=max_horizon,
        )
        scheduler.step()
        curve.append(
            {
                "epoch": float(epoch),
                "train_loss": round(train_loss, 6),
                "val_loss": round(val_huber, 6),
                "val_gate_score": round(val_gate, 6),
            }
        )

        if val_gate < best_val_gate - 1e-8:
            best_val_gate = val_gate
            best_val_huber = val_huber
            best_state = copy.deepcopy(model.state_dict())
            stale = 0
        else:
            stale += 1

        if epoch % 50 == 0 or epoch == 1:
            logger.info(
                "Pooled epoch %d/%d train_loss=%.6f val_huber=%.6f val_gate=%.6f (best_gate=%.6f)",
                epoch,
                max_epochs,
                train_loss,
                val_huber,
                val_gate,
                best_val_gate,
            )
            for ds in val_datasets:
                rk = getattr(ds[0], "region_key", "?") if len(ds) else "?"
                mae1 = _region_val_mae1(model, ds, mean, std, config=config, max_horizon=max_horizon)
                logger.info("  val %s 1w MAE=%.4f", rk, mae1)
        if stale >= patience:
            logger.info("Pooled early stopping at epoch %d (patience=%d)", epoch, patience)
            break

    if best_state is not None:
        model.load_state_dict(best_state)

    holdout_metrics_by_region: dict[str, dict[str, Any]] = {}
    val_metrics_by_region: dict[str, dict[str, Any]] = {}
    trend_diagnostics_by_region: dict[str, dict[str, Any]] = {}
    for region_key, history in histories_by_region.items():
        holdout_block = evaluate_holdout(
            model,
            history,
            holdout_origins_by_region[region_key],
            mean,
            std,
            config=config,
            covariate_stats=cov_stats,
            region_key=region_key,
            max_horizon=max_horizon,
        )
        holdout_metrics_by_region[region_key] = holdout_block
        trend_diagnostics_by_region[region_key] = holdout_block.get("trend_diagnostics_1w") or {}
        split = splits[region_key]
        val_origins = _origins_with_horizon(split.val_indices, len(history), max_horizon)
        val_metrics_by_region[region_key] = evaluate_holdout(
            model,
            history,
            val_origins,
            mean,
            std,
            config=config,
            covariate_stats=cov_stats,
            region_key=region_key,
            max_horizon=max_horizon,
        )

    return PooledTrainResult(
        best_val_loss=best_val_huber,
        best_val_gate_score=best_val_gate,
        epochs_run=len(curve),
        mean=mean,
        std=std,
        training_curve=curve,
        holdout_metrics_by_region=holdout_metrics_by_region,
        val_metrics_by_region=val_metrics_by_region,
        trend_diagnostics_by_region=trend_diagnostics_by_region,
        model=model,
        covariate_stats=cov_stats,
        seed=seed,
    )


def _region_val_mae1(
    model: NeuralODE,
    dataset: WeeklyRegionDataset,
    mean: float,
    std: float,
    *,
    config: NeuralOdeConfig,
    max_horizon: int,
) -> float:
    errors: list[float] = []
    model.eval()
    with torch.no_grad():
        for idx in range(len(dataset)):
            sample = dataset[idx]
            origin = sample.origin_index
            _apply_sample_context(model, sample, config)
            t_eval = torch.arange(0, max_horizon + 1, dtype=torch.float32)
            traj = model(sample.x0, t_eval)
            traj = _apply_sample_anchor(traj, sample, model, config, mean=mean, std=std)
            pred = unstandardize(
                float(traj[1, 0, 0].item()),
                mean,
                std,
                use_log_transform=config.log_target,
            )
            errors.append(abs(pred - dataset.history[origin + 1].value))
    return statistics.mean(errors) if errors else float("inf")


def train_one_region_multi_seed(
    history: list[WeeklySeriesPoint],
    seeds: Sequence[int],
    **kwargs: Any,
) -> TrainResult:
    """Train with multiple seeds; keep checkpoint with lowest val_gate_score."""
    best: TrainResult | None = None
    for s in seeds:
        from scripts.lib.neural_ode.reproducibility import seed_everything

        seed_everything(s)
        result = train_one_region(history, seed=s, **kwargs)
        if best is None or result.best_val_gate_score < best.best_val_gate_score:
            best = result
    if best is None:
        raise RuntimeError("multi-seed training produced no result")
    return best
