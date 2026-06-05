"""Neural ODE dynamics with optional residual baseline and augmented latent state."""

from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn
from torchdiffeq import odeint

from scripts.lib.neural_ode.covariates import calendar_features_at_t


@dataclass(frozen=True)
class NeuralOdeConfig:
    state_dim: int = 1
    hidden_dim: int = 32
    depth: int = 2
    solver: str = "rk4"
    step_size: float = 1 / 7
    huber_delta: float = 1.0
    with_covariates: bool = False
    n_origin_covariates: int = 4
    use_calendar_features: bool = True
    residual_on_persistence: bool = False
    log_target: bool = False
    baseline_anchor_head: bool = False
    trend_loss_weight: float = 0.0
    trend_loss_horizons: int = 2
    trend_loss_deadband: float = 0.05
    trend_loss_temperature: float = 0.1
    correction_cap_weight: float = 0.0
    correction_cap_value: float = 0.7
    correction_cap_h1: float = 0.5
    correction_cap_h2: float = 0.7
    correction_cap_h3: float = 0.85
    correction_cap_h4: float = 1.0
    correction_cap_horizons: int = 4
    hard_correction_bound: bool = False
    correction_shrinkage_enabled: bool = False
    correction_gate_penalty_weight: float = 0.0
    correction_gate_h1_penalty_weight: float = 2.0
    correction_gate_medium_horizon_penalty_weight: float = 1.75
    correction_gate_h4_penalty_weight: float | None = None
    correction_gate_init_logits: tuple[float, ...] | None = None
    val_gate_excess_weight: float = 2.0
    val_gate_open_gate_weight: float = 0.0
    val_gate_trend_weight: float = 0.0
    region_balance_weight: float = 0.0
    turn_point_weight: float = 1.0
    turn_point_margin: float = 0.10


class ODEFunc(nn.Module):
    """f(t, x) -> dx/dt. Inputs: state, relative time, optional calendar + origin covariates."""

    def __init__(
        self,
        state_dim: int = 1,
        hidden_dim: int = 32,
        depth: int = 2,
        *,
        with_covariates: bool = False,
        n_origin_covariates: int = 4,
        use_calendar_features: bool = True,
        residual_on_persistence: bool = False,
    ) -> None:
        super().__init__()
        if depth < 1:
            raise ValueError("depth must be >= 1")

        self.with_covariates = with_covariates
        self.n_origin_covariates = n_origin_covariates
        self.use_calendar_features = use_calendar_features
        self.residual_on_persistence = residual_on_persistence
        self.origin_week_index = 0
        self._origin_ctx: torch.Tensor | None = None
        self._x0_ctx: torch.Tensor | None = None

        extra = 0
        if with_covariates:
            if use_calendar_features:
                extra += 2
            extra += n_origin_covariates
        if residual_on_persistence:
            # Keep absolute level available to the vector field even when state stores deltas.
            extra += 1

        layers: list[nn.Module] = []
        in_dim = state_dim + 1 + extra
        for i in range(depth):
            out_dim = hidden_dim if i < depth - 1 else state_dim
            layers.append(nn.Linear(in_dim, out_dim))
            if i < depth - 1:
                layers.append(nn.Tanh())
            in_dim = out_dim
        self.net = nn.Sequential(*layers)
        self._init_weights()

    def _init_weights(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def set_context(
        self,
        *,
        origin_week_index: int,
        origin_ctx: torch.Tensor | None = None,
        x0_context: torch.Tensor | None = None,
    ) -> None:
        self.origin_week_index = origin_week_index
        self._origin_ctx = origin_ctx
        self._x0_ctx = x0_context

    def _build_input(self, t: torch.Tensor, x: torch.Tensor) -> torch.Tensor:
        if t.dim() == 0:
            t_col = t.reshape(1, 1).expand(x.size(0), 1)
        else:
            t_col = t.reshape(-1, 1) if t.numel() == 1 else t
            if t_col.size(0) != x.size(0):
                t_col = t_col.expand(x.size(0), 1)

        parts = [x, t_col.to(dtype=x.dtype, device=x.device)]

        if self.with_covariates:
            t_val = float(t.item()) if t.numel() == 1 else float(t.reshape(-1)[0].item())
            if self.use_calendar_features:
                sin_w, cos_w = calendar_features_at_t(self.origin_week_index, t_val)
                cal = torch.tensor(
                    [[sin_w, cos_w]],
                    dtype=x.dtype,
                    device=x.device,
                ).expand(x.size(0), 2)
                parts.append(cal)
            if self._origin_ctx is not None:
                ctx = self._origin_ctx.to(device=x.device, dtype=x.dtype)
                if ctx.size(0) != x.size(0):
                    ctx = ctx.expand(x.size(0), -1)
                parts.append(ctx)
        if self.residual_on_persistence and self._x0_ctx is not None:
            x0_ctx = self._x0_ctx.to(device=x.device, dtype=x.dtype)
            if x0_ctx.size(0) != x.size(0):
                x0_ctx = x0_ctx.expand(x.size(0), -1)
            parts.append(x0_ctx)

        return torch.cat(parts, dim=-1)

    def forward(self, t: torch.Tensor, x: torch.Tensor) -> torch.Tensor:
        return self.net(self._build_input(t, x))


class NeuralODE(nn.Module):
    """Integrate ODEFunc from t=0 over t_eval (weeks)."""

    def __init__(self, config: NeuralOdeConfig | None = None) -> None:
        super().__init__()
        self.config = config or NeuralOdeConfig()
        self.func = ODEFunc(
            state_dim=self.config.state_dim,
            hidden_dim=self.config.hidden_dim,
            depth=self.config.depth,
            with_covariates=self.config.with_covariates,
            n_origin_covariates=self.config.n_origin_covariates,
            use_calendar_features=self.config.use_calendar_features,
            residual_on_persistence=self.config.residual_on_persistence,
        )
        if self.config.state_dim < 1:
            raise ValueError("state_dim must be >= 1")
        if self.config.correction_shrinkage_enabled:
            init = self._default_gate_init_logits()
            self.correction_gate_logits = nn.Parameter(
                torch.tensor(init, dtype=torch.float32)
            )

    def _default_gate_init_logits(self) -> list[float]:
        if self.config.correction_gate_init_logits:
            return list(self.config.correction_gate_init_logits)[:4]
        # Bias h1 toward abstention; allow h2/h4 to open if validation improves.
        return [-2.0, 0.0, 0.5, 1.0]

    def correction_gates(
        self,
        n_horizons: int,
        *,
        device: torch.device | None = None,
        dtype: torch.dtype | None = None,
    ) -> torch.Tensor:
        """Per-horizon gates in [0, 1] for shrinkage (length n_horizons)."""
        if not hasattr(self, "correction_gate_logits"):
            ones = torch.ones(n_horizons, dtype=dtype or torch.float32)
            return ones.to(device=device) if device else ones
        logits = self.correction_gate_logits[:n_horizons]
        gates = torch.sigmoid(logits)
        if device is not None or dtype is not None:
            gates = gates.to(device=device, dtype=dtype)
        return gates

    def set_context(
        self,
        *,
        origin_week_index: int,
        origin_ctx: torch.Tensor | None = None,
        x0_context: torch.Tensor | None = None,
    ) -> None:
        self.func.set_context(
            origin_week_index=origin_week_index,
            origin_ctx=origin_ctx,
            x0_context=x0_context,
        )

    def _init_state(self, x0: torch.Tensor) -> torch.Tensor:
        """Create internal ODE state from observed initial value."""
        batch = x0.size(0)
        observed_state = torch.zeros_like(x0) if self.config.residual_on_persistence else x0
        if self.config.state_dim == 1:
            return observed_state
        latent = torch.zeros(
            (batch, self.config.state_dim - 1),
            dtype=x0.dtype,
            device=x0.device,
        )
        return torch.cat([observed_state, latent], dim=-1)

    def state_to_observed(self, state_traj: torch.Tensor, x0: torch.Tensor) -> torch.Tensor:
        """Project internal trajectory to observed (standardized) dimension."""
        observed = state_traj[..., :1]
        if self.config.residual_on_persistence:
            return observed + x0.unsqueeze(0)
        return observed

    def forward_state(self, x0: torch.Tensor, t_eval: torch.Tensor) -> torch.Tensor:
        """Return internal state trajectory: (len(t_eval), batch, state_dim)."""
        if t_eval.dim() != 1:
            raise ValueError("t_eval must be 1-dimensional")

        options: dict[str, float] = {}
        if self.config.solver == "rk4":
            options["step_size"] = self.config.step_size

        # Always expose absolute origin level to dynamics in residual mode.
        self.func.set_context(
            origin_week_index=self.func.origin_week_index,
            origin_ctx=self.func._origin_ctx,
            x0_context=x0,
        )
        state0 = self._init_state(x0)
        return odeint(
            self.func,
            state0,
            t_eval,
            method=self.config.solver,
            options=options,
        )

    def forward(self, x0: torch.Tensor, t_eval: torch.Tensor) -> torch.Tensor:
        """Return observed trajectory: (len(t_eval), batch, 1)."""
        state_traj = self.forward_state(x0, t_eval)
        return self.state_to_observed(state_traj, x0)

    def derivative_at(
        self,
        t: torch.Tensor,
        x: torch.Tensor,
    ) -> torch.Tensor:
        return self.func(t, x)

    def derivative_observed_at(
        self,
        t: torch.Tensor,
        x: torch.Tensor,
    ) -> torch.Tensor:
        """Derivative for observed state dimension only."""
        return self.func(t, x)[..., :1]


def huber_loss(
    pred: torch.Tensor,
    target: torch.Tensor,
    delta: float = 1.0,
) -> torch.Tensor:
    diff = pred - target
    abs_diff = diff.abs()
    quadratic = torch.minimum(abs_diff, torch.full_like(abs_diff, delta))
    linear = abs_diff - quadratic
    loss = 0.5 * quadratic**2 + delta * linear
    return loss.mean()


def weighted_huber_loss(
    pred: torch.Tensor,
    target: torch.Tensor,
    horizon_weights: torch.Tensor,
    *,
    delta: float = 1.0,
) -> torch.Tensor:
    """Huber per horizon step, weighted by horizon_weights (len = n_horizon steps)."""
    if pred.shape[0] != target.shape[0] or pred.shape[0] != horizon_weights.shape[0]:
        raise ValueError("pred, target, and horizon_weights must align on dim 0")
    weights = horizon_weights.to(device=pred.device, dtype=pred.dtype)
    losses = []
    for i in range(pred.shape[0]):
        step = huber_loss(pred[i : i + 1], target[i : i + 1], delta=delta)
        losses.append(weights[i] * step)
    stacked = torch.stack(losses)
    return stacked.sum() / weights.sum().clamp(min=1e-8)
