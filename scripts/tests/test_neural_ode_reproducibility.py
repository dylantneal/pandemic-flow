"""Reproducibility acceptance: train twice with same seed -> identical metrics."""

from __future__ import annotations

from datetime import date

import torch

from scripts.lib.forecast_baselines import WeeklySeriesPoint
from scripts.lib.neural_ode.dataset import (
    WeeklyRegionDataset,
    compute_series_split,
    fit_standardization,
)
from scripts.lib.neural_ode.model import NeuralODE, NeuralOdeConfig, huber_loss
from scripts.lib.neural_ode.reproducibility import hash_training_slice, seed_everything


def _synthetic_history(n: int = 80) -> list[WeeklySeriesPoint]:
    start = date(2020, 1, 6)
    values: list[float] = []
    v = 1.0
    for i in range(n):
        v += 0.02 * (i % 5 - 2) + 0.01 * (i % 7)
        values.append(v)
    return [
        WeeklySeriesPoint(
            week_start=date.fromordinal(start.toordinal() + 7 * i),
            value=values[i],
        )
        for i in range(n)
    ]


def _short_train(seed: int) -> tuple[float, float, str]:
    """Train a small model; return (param_sum, final_loss, data_hash)."""
    seed_everything(seed)
    history = _synthetic_history(80)
    split = compute_series_split(len(history))
    mean, std = fit_standardization(history, split.train_indices)
    data_hash = hash_training_slice(history, split.train_indices)

    origins = [i for i in split.train_indices if i + 4 < len(history)][::3]
    ds = WeeklyRegionDataset(history, origins, mean, std, max_horizon=4)

    config = NeuralOdeConfig(hidden_dim=16, depth=2, step_size=1 / 7)
    model = NeuralODE(config)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-5)

    final_loss = 0.0
    for _ in range(40):
        epoch_loss = 0.0
        for idx in range(len(ds)):
            sample = ds[idx]
            traj = model(sample.x0, sample.t_eval)
            loss = huber_loss(traj[1:], sample.y_target[1:], delta=config.huber_delta)
            opt.zero_grad()
            loss.backward()
            opt.step()
            epoch_loss += loss.item()
        final_loss = epoch_loss / max(len(ds), 1)

    param_sum = sum(p.detach().sum().item() for p in model.parameters())
    return param_sum, final_loss, data_hash


class TestReproducibility:
    def test_train_twice_identical(self) -> None:
        a_params, a_loss, a_hash = _short_train(42)
        b_params, b_loss, b_hash = _short_train(42)
        assert a_hash == b_hash
        assert abs(a_params - b_params) < 1e-6
        assert abs(a_loss - b_loss) < 1e-6

    def test_different_seed_differs(self) -> None:
        a_params, _, _ = _short_train(42)
        b_params, _, _ = _short_train(43)
        assert a_params != b_params

    def test_hash_stable_for_same_data(self) -> None:
        history = _synthetic_history(80)
        split = compute_series_split(len(history))
        h1 = hash_training_slice(history, split.train_indices)
        h2 = hash_training_slice(history, split.train_indices)
        assert h1 == h2
