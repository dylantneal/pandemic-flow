"""Tests for Neural ODE training loop."""

from __future__ import annotations

from datetime import date

import torch

from scripts.lib.forecast_baselines import WeeklySeriesPoint
from scripts.lib.neural_ode.model import NeuralOdeConfig
from scripts.lib.neural_ode.reproducibility import seed_everything
from scripts.lib.neural_ode.dataset import WeeklyRegionDataset, compute_series_split
from scripts.lib.neural_ode.metrics import is_turn_point_origin
from scripts.lib.neural_ode.train_runner import node_config_from_profile
from scripts.lib.neural_ode.training import (
    _balance_weights_from_counts,
    correction_cap_penalty,
    evaluate_holdout,
    gate_consistent_trend_loss,
    train_one_region,
    train_pooled_regions,
)


def _history(n: int = 80) -> list[WeeklySeriesPoint]:
    start = date(2020, 1, 6)
    values: list[float] = []
    v = 1.0
    for i in range(n):
        v += 0.03 * ((i % 11) - 5) + 0.01 * (i % 3)
        values.append(v)
    return [
        WeeklySeriesPoint(
            week_start=date.fromordinal(start.toordinal() + 7 * i),
            value=values[i],
        )
        for i in range(n)
    ]


class TestTrainOneRegion:
    def test_training_reduces_val_loss(self) -> None:
        seed_everything(0)
        history = _history(80)
        config = NeuralOdeConfig(hidden_dim=16, depth=2)
        result = train_one_region(
            history,
            config=config,
            max_epochs=60,
            patience=20,
        )
        assert result.epochs_run >= 1
        assert result.model is not None
        assert result.best_val_loss < float("inf")
        assert "by_horizon" in result.holdout_metrics

    def test_holdout_metrics_structure(self) -> None:
        seed_everything(1)
        history = _history(80)
        result = train_one_region(
            history,
            config=NeuralOdeConfig(hidden_dim=8, depth=2),
            max_epochs=30,
            patience=15,
        )
        assert result.model is not None
        metrics = evaluate_holdout(
            result.model,
            history,
            list(range(64, 80)),
            result.mean,
            result.std,
        )
        assert metrics["total_evaluations"] > 0
        assert "1" in metrics["by_horizon"]
        assert "residual_sigma_by_horizon" in metrics
        h1 = metrics["by_horizon"]["1"]
        assert "trend_accuracy" in h1
        assert h1["trend_accuracy"] is not None

    def test_holdout_metrics_with_covariates(self) -> None:
        seed_everything(2)
        base = _history(80)
        history = [
            WeeklySeriesPoint(
                week_start=pt.week_start,
                value=pt.value,
                quality_score=0.7 + 0.01 * (i % 10),
                active_site_count=float(10 + (i % 5)),
                population_represented=1_000_000.0,
                week_over_week_change=0.1 * ((i % 7) - 3),
            )
            for i, pt in enumerate(base)
        ]
        result = train_one_region(
            history,
            config=NeuralOdeConfig(hidden_dim=16, depth=2, with_covariates=True),
            max_epochs=40,
            patience=15,
        )
        assert result.covariate_stats is not None
        assert result.best_val_gate_score < float("inf")

    def test_train_pooled_regions_smoke(self) -> None:
        seed_everything(3)
        base_a = _history(80)
        base_b = _history(80)
        hist_a = [
            WeeklySeriesPoint(
                week_start=pt.week_start,
                value=pt.value,
                quality_score=0.6 + 0.01 * (i % 10),
                active_site_count=float(10 + (i % 3)),
                population_represented=1_000_000.0,
                week_over_week_change=0.1 * ((i % 7) - 3),
            )
            for i, pt in enumerate(base_a)
        ]
        hist_b = [
            WeeklySeriesPoint(
                week_start=pt.week_start,
                value=pt.value + 0.2,
                quality_score=0.7 + 0.01 * (i % 8),
                active_site_count=float(14 + (i % 4)),
                population_represented=800_000.0,
                week_over_week_change=0.1 * ((i % 9) - 4),
            )
            for i, pt in enumerate(base_b)
        ]
        result = train_pooled_regions(
            {
                "state:IL": hist_a,
                "county:17031": hist_b,
            },
            config=NeuralOdeConfig(
                state_dim=2,
                hidden_dim=8,
                depth=2,
                with_covariates=True,
                n_origin_covariates=6,
                residual_on_persistence=False,
                log_target=True,
                baseline_anchor_head=True,
            ),
            max_epochs=25,
            patience=10,
        )
        assert result.model is not None
        assert set(result.holdout_metrics_by_region.keys()) == {"state:IL", "county:17031"}
        assert "1" in result.holdout_metrics_by_region["state:IL"]["by_horizon"]

    def test_gate_consistent_trend_loss_penalizes_wrong_class(self) -> None:
        # Use raw-space identity (mean=0, std=1, no log) so +/-0.25 thresholds apply directly.
        target = torch.tensor([[[0.0]], [[0.45]]], dtype=torch.float32)  # rising
        pred_aligned = torch.tensor([[[0.0]], [[0.50]]], dtype=torch.float32)  # rising
        pred_misaligned = torch.tensor([[[0.0]], [[-0.45]]], dtype=torch.float32)  # falling
        good = gate_consistent_trend_loss(
            pred_aligned,
            target,
            mean=0.0,
            std=1.0,
            use_log_transform=False,
            max_horizons=1,
        )
        bad = gate_consistent_trend_loss(
            pred_misaligned,
            target,
            mean=0.0,
            std=1.0,
            use_log_transform=False,
            max_horizons=1,
        )
        assert good.item() < bad.item()

    def test_correction_cap_penalty_activates_only_over_cap(self) -> None:
        anchor = torch.tensor([[0.0], [0.1], [0.2]], dtype=torch.float32)
        pred_within = torch.tensor([[[0.0]], [[0.35]], [[0.45]]], dtype=torch.float32)
        pred_over = torch.tensor([[[0.0]], [[0.7]], [[0.9]]], dtype=torch.float32)
        within_penalty = correction_cap_penalty(
            pred_within,
            anchor,
            mean=0.0,
            std=1.0,
            use_log_transform=False,
            cap=0.4,
            max_horizons=2,
        )
        over_penalty = correction_cap_penalty(
            pred_over,
            anchor,
            mean=0.0,
            std=1.0,
            use_log_transform=False,
            cap=0.4,
            max_horizons=2,
        )
        assert within_penalty.item() == 0.0
        assert over_penalty.item() > 0.0

    def test_per_horizon_correction_caps(self) -> None:
        anchor = torch.tensor([[0.0], [0.0], [0.0]], dtype=torch.float32)
        pred = torch.tensor([[[0.0]], [[0.6]], [[0.9]]], dtype=torch.float32)
        tight_h1 = correction_cap_penalty(
            pred,
            anchor,
            mean=0.0,
            std=1.0,
            use_log_transform=False,
            caps_by_horizon={1: 0.3, 2: 0.9},
            max_horizons=2,
        )
        assert tight_h1.item() > 0.0


class TestDatasetMetadata:
    def test_sample_has_turn_point_and_balance_weight(self) -> None:
        history = _history(80)
        split = compute_series_split(len(history))
        train_origins = [i for i in split.train_indices if i + 4 < len(history)]
        weights = _balance_weights_from_counts(
            {"state:IL": len(train_origins)},
            enabled=True,
        )
        ds = WeeklyRegionDataset(
            history,
            train_origins[:20],
            0.0,
            1.0,
            region_key="state:IL",
            region_balance_weights=weights,
            turn_point_margin=0.10,
        )
        assert len(ds) > 0
        sample = ds[0]
        assert sample.region_key == "state:IL"
        assert sample.sample_weight == 1.0
        origin = sample.origin_index
        change = history[origin + 1].value - history[origin].value
        assert sample.is_turn_point == is_turn_point_origin(change, margin=0.10)
        assert sample.actual_trend_class_h1 in (0, 1, 2)

    def test_holdout_includes_trend_diagnostics(self) -> None:
        seed_everything(3)
        history = _history(80)
        result = train_one_region(
            history,
            config=NeuralOdeConfig(
                hidden_dim=8,
                depth=2,
                baseline_anchor_head=True,
                log_target=True,
            ),
            max_epochs=25,
            patience=12,
        )
        assert "trend_diagnostics_1w" in result.holdout_metrics
        diag = result.holdout_metrics["trend_diagnostics_1w"]
        assert "confusion" in diag


class TestReliabilityProfile:
    def test_reliability_profile_uses_hard_correction_bound(self) -> None:
        config = node_config_from_profile("reliability_correction_v1")
        assert config.baseline_anchor_head is True
        assert config.hard_correction_bound is True
        assert config.log_target is False
        assert config.correction_cap_h1 == 0.25
