"""Tests for Neural ODE covariate helpers."""

from __future__ import annotations

from datetime import date

import torch

from scripts.lib.forecast_baselines import WeeklySeriesPoint
from scripts.lib.neural_ode.covariates import (
    CovariateStats,
    calendar_features_at_t,
    covariate_stats_from_dict,
    covariate_stats_to_dict,
    fit_covariate_stats,
    origin_context_vector,
)
from scripts.lib.neural_ode.model import NeuralODE, NeuralOdeConfig


def test_calendar_features_periodic() -> None:
    s0, c0 = calendar_features_at_t(10, 0.0)
    s52, c52 = calendar_features_at_t(10, 52.0)
    assert abs(s0 - s52) < 0.01
    assert abs(c0 - c52) < 0.01


def test_covariate_model_forward() -> None:
    history = [
        WeeklySeriesPoint(
            week_start=date(2020, 1, 6),
            value=1.0,
            quality_score=0.8,
            active_site_count=12.0,
            population_represented=1e6,
            week_over_week_change=0.1,
        )
    ]
    stats = fit_covariate_stats(history, [0])
    model = NeuralODE(NeuralOdeConfig(with_covariates=True, hidden_dim=8, depth=2))
    ctx = origin_context_vector(history[0], stats)
    model.set_context(origin_week_index=0, origin_ctx=ctx)
    x0 = torch.tensor([[0.0]])
    t_eval = torch.tensor([0.0, 1.0, 2.0])
    traj = model(x0, t_eval)
    assert traj.shape == (3, 1, 1)


def test_region_conditioning_context_and_roundtrip() -> None:
    history = [
        WeeklySeriesPoint(
            week_start=date(2020, 1, 6),
            value=1.0,
            quality_score=0.8,
            active_site_count=12.0,
            population_represented=1e6,
            week_over_week_change=0.1,
        )
    ]
    base = fit_covariate_stats(history, [0])
    stats = CovariateStats(
        means=base.means,
        stds=base.stds,
        region_keys=("state:IL", "county:17031"),
    )
    ctx_state = origin_context_vector(history[0], stats, region_key="state:IL")
    ctx_county = origin_context_vector(history[0], stats, region_key="county:17031")
    assert ctx_state.shape[1] == 6
    assert ctx_state[0, -2].item() == 1.0
    assert ctx_state[0, -1].item() == 0.0
    assert ctx_county[0, -2].item() == 0.0
    assert ctx_county[0, -1].item() == 1.0

    restored = covariate_stats_from_dict(covariate_stats_to_dict(stats))
    assert restored.region_keys == stats.region_keys
