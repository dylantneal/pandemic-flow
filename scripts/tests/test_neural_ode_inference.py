"""Tests for Neural ODE inference outputs."""

from __future__ import annotations

from datetime import date

import pytest

from scripts.lib.forecast_baselines import WeeklySeriesPoint
from scripts.lib.neural_ode.dataset import build_baseline_anchor_series
from scripts.lib.neural_ode.inference import DAILY_STEPS_PER_WEEK, forecast_at_origin
from scripts.lib.neural_ode.model import NeuralODE, NeuralOdeConfig
from scripts.lib.neural_ode.reproducibility import seed_everything


def _history(n: int = 40) -> list[WeeklySeriesPoint]:
    start = date(2022, 1, 3)
    return [
        WeeklySeriesPoint(
            week_start=date.fromordinal(start.toordinal() + 7 * i),
            value=1.0 + 0.05 * i,
        )
        for i in range(n)
    ]


class TestForecastAtOrigin:
    def test_four_horizons_and_derivative_grid(self) -> None:
        seed_everything(7)
        model = NeuralODE(NeuralOdeConfig(hidden_dim=8, depth=2))
        history = _history(40)
        mean, std = 1.5, 0.5
        result = forecast_at_origin(
            model,
            history,
            origin_index=30,
            mean=mean,
            std=std,
        )

        assert len(result.forecasts) == 4
        horizons = {fp.horizon_weeks for fp in result.forecasts}
        assert horizons == {1, 2, 3, 4}

        assert len(result.derivatives) == 4 * DAILY_STEPS_PER_WEEK

        for h in (1, 2, 3, 4):
            segment = [d for d in result.derivatives if d.horizon_weeks == h]
            assert len(segment) == DAILY_STEPS_PER_WEEK
            assert [d.step_idx for d in segment] == list(range(DAILY_STEPS_PER_WEEK))
            days = [d.t_offset_days for d in segment]
            expected = [float((h - 1) * 7 + (s + 1)) for s in range(DAILY_STEPS_PER_WEEK)]
            assert days == expected

    def test_derivative_scales_with_std(self) -> None:
        seed_everything(0)
        model = NeuralODE(NeuralOdeConfig(hidden_dim=8, depth=2))
        history = _history(40)
        r1 = forecast_at_origin(model, history, 30, 1.0, 0.5)
        r2 = forecast_at_origin(model, history, 30, 1.0, 1.0)
        assert r1.derivatives[0].predicted_derivative != r2.derivatives[0].predicted_derivative

    def test_log_target_augmented_mode_outputs_finite_values(self) -> None:
        seed_everything(9)
        model = NeuralODE(
            NeuralOdeConfig(
                state_dim=2,
                hidden_dim=8,
                depth=2,
                residual_on_persistence=True,
                log_target=True,
            )
        )
        history = _history(40)
        result = forecast_at_origin(model, history, 30, mean=0.0, std=1.0)
        assert len(result.forecasts) == 4
        assert all(fp.predicted_activity_index >= 0.0 for fp in result.forecasts)
        assert all(abs(d.predicted_derivative) < 1e6 for d in result.derivatives)

    def test_baseline_anchor_head_uses_anchor_when_correction_zero(self) -> None:
        history = _history(40)
        model = NeuralODE(
            NeuralOdeConfig(
                state_dim=2,
                hidden_dim=8,
                depth=2,
                log_target=False,
                baseline_anchor_head=True,
            )
        )
        for p in model.parameters():
            p.data.zero_()

        result = forecast_at_origin(
            model,
            history,
            origin_index=30,
            mean=0.0,
            std=1.0,
        )
        anchor = build_baseline_anchor_series(history, 30, max_horizon=4)
        by_h = {fp.horizon_weeks: fp.predicted_activity_index for fp in result.forecasts}
        assert by_h[1] == pytest.approx(anchor[1], abs=1e-3)
        assert by_h[2] == pytest.approx(anchor[2], abs=1e-3)
