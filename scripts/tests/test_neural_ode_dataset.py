"""Tests for Neural ODE dataset and splits."""

from __future__ import annotations

from datetime import date

import pytest
import torch

from scripts.lib.forecast_baselines import WeeklySeriesPoint
from scripts.lib.neural_ode.dataset import (
    WeeklyRegionDataset,
    apply_baseline_anchor,
    build_baseline_anchor_series,
    compute_series_split,
    fit_standardization,
    standardize,
    unstandardize,
)


def _history(n: int, start: date = date(2020, 1, 6)) -> list[WeeklySeriesPoint]:
    return [
        WeeklySeriesPoint(
            week_start=date.fromordinal(start.toordinal() + 7 * i),
            value=float(i) * 0.1 + 1.0,
        )
        for i in range(n)
    ]


class TestSeriesSplit:
    def test_partitions_do_not_overlap(self) -> None:
        split = compute_series_split(80)
        train = set(split.train_indices)
        val = set(split.val_indices)
        holdout = set(split.holdout_indices)
        assert train.isdisjoint(val)
        assert train.isdisjoint(holdout)
        assert val.isdisjoint(holdout)
        assert len(train) + len(val) + len(holdout) == 80

    def test_holdout_is_last_16_weeks(self) -> None:
        split = compute_series_split(80)
        assert split.holdout_start == 64
        assert split.holdout_indices == list(range(64, 80))

    def test_raises_on_short_series(self) -> None:
        with pytest.raises(ValueError):
            compute_series_split(20)


class TestStandardization:
    def test_uses_train_only(self) -> None:
        hist = _history(80)
        split = compute_series_split(80)
        mean, std = fit_standardization(hist, split.train_indices)
        # Holdout values must not affect mean
        holdout_vals = [hist[i].value for i in split.holdout_indices]
        train_vals = [hist[i].value for i in split.train_indices]
        assert abs(mean - sum(train_vals) / len(train_vals)) < 1e-9
        # Holdout weeks are not in train_indices
        assert all(i < split.holdout_start for i in split.train_indices)
        assert min(holdout_vals) <= max(holdout_vals)  # holdout slice exists

    def test_standardize_roundtrip(self) -> None:
        z = standardize(5.0, 3.0, 2.0)
        assert abs(z - 1.0) < 1e-9

    def test_log_transform_roundtrip(self) -> None:
        mean, std = 0.2, 0.4
        z = standardize(2.5, mean, std, use_log_transform=True)
        x = unstandardize(z, mean, std, use_log_transform=True)
        assert x == pytest.approx(2.5, rel=1e-6)


class TestWeeklyRegionDataset:
    def test_sample_count(self) -> None:
        hist = _history(80)
        split = compute_series_split(80)
        mean, std = fit_standardization(hist, split.train_indices)
        ds = WeeklyRegionDataset(hist, split.train_indices, mean, std, max_horizon=4)
        # Origins that cannot reach +4 weeks are skipped
        expected = sum(
            1 for i in split.train_indices if i + 4 < len(hist)
        )
        assert len(ds) == expected

    def test_no_holdout_origins_in_train_dataset(self) -> None:
        hist = _history(80)
        split = compute_series_split(80)
        mean, std = fit_standardization(hist, split.train_indices)
        ds = WeeklyRegionDataset(hist, split.train_indices, mean, std)
        holdout_set = set(split.holdout_indices)
        for sample in ds.samples:
            assert sample.origin_index not in holdout_set

    def test_target_aligns_with_horizon(self) -> None:
        hist = _history(80)
        split = compute_series_split(80)
        mean, std = fit_standardization(hist, split.train_indices)
        ds = WeeklyRegionDataset(hist, [10], mean, std, max_horizon=2)
        sample = ds[0]
        assert sample.t_eval.shape == (3,)
        assert sample.y_target.shape == (3, 1)
        assert sample.x0.item() == pytest.approx(sample.y_target[0].item())

    def test_baseline_anchor_series_shape(self) -> None:
        hist = _history(80)
        anchor = build_baseline_anchor_series(hist, 20, max_horizon=4)
        assert len(anchor) == 5
        assert anchor[0] == pytest.approx(hist[20].value)
        assert anchor[1] == pytest.approx(hist[20].value)

    def test_apply_baseline_anchor_identity_when_no_correction(self) -> None:
        x0 = torch.tensor([[0.2]], dtype=torch.float32)
        traj = x0.unsqueeze(0).repeat(5, 1, 1)
        anchor = torch.tensor([[0.2], [0.1], [0.0], [-0.1], [-0.2]], dtype=torch.float32)
        out = apply_baseline_anchor(traj, x0, anchor)
        assert out.shape == (5, 1, 1)
        assert out[:, 0, 0].tolist() == pytest.approx(anchor[:, 0].tolist())

    def test_apply_baseline_anchor_hard_bounds_correction_by_horizon(self) -> None:
        x0 = torch.tensor([[0.0]], dtype=torch.float32)
        traj = torch.tensor([[[0.0]], [[10.0]], [[-10.0]]], dtype=torch.float32)
        anchor = torch.zeros((3, 1), dtype=torch.float32)

        out = apply_baseline_anchor(
            traj,
            x0,
            anchor,
            hard_bound=True,
            caps_by_horizon={1: 0.25, 2: 0.5},
            mean=0.0,
            std=1.0,
        )

        assert abs(out[1, 0, 0].item()) <= 0.25
        assert abs(out[2, 0, 0].item()) <= 0.5
