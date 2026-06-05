"""Shrinkage, improvement metrics, and reliability regression tests."""

from __future__ import annotations

import torch

from scripts.lib.neural_ode.dataset import apply_baseline_anchor
from scripts.lib.neural_ode.metrics import (
    aggregate_improvement_vs_ensemble,
    recalibrate_residual_sigma_by_horizon,
)
from scripts.lib.neural_ode.model import NeuralOdeConfig, NeuralODE
from scripts.lib.neural_ode.train_runner import node_config_from_profile


class TestReliabilityRegression:
    def test_reliability_profile_invariants(self) -> None:
        config = node_config_from_profile("reliability_correction_v1")
        assert config.baseline_anchor_head is True
        assert config.hard_correction_bound is True
        assert config.log_target is False
        assert config.correction_cap_h1 == 0.25
        assert config.correction_shrinkage_enabled is False

    def test_shrinkage_profile_enables_gates(self) -> None:
        config = node_config_from_profile("shrinkage_correction_v1")
        assert config.correction_shrinkage_enabled is True
        assert config.correction_gate_penalty_weight > 0
        assert config.log_target is False
        assert config.hard_correction_bound is True


class TestShrinkageMath:
    def test_gate_zero_equals_anchor(self) -> None:
        anchor = torch.tensor([[0.0], [1.0], [2.0], [3.0]]).reshape(4, 1, 1)
        traj = torch.tensor([[0.5], [1.5], [2.5], [3.5]]).reshape(4, 1, 1)
        x0 = torch.tensor([[0.0]])
        gates = torch.zeros(4)
        out = apply_baseline_anchor(
            traj,
            x0,
            anchor,
            hard_bound=True,
            caps_by_horizon={1: 0.25, 2: 0.35, 3: 0.5, 4: 0.65},
            horizon_numbers=[1, 2, 3, 4],
            mean=0.0,
            std=1.0,
            use_log_transform=False,
            correction_gates=gates,
        )
        assert torch.allclose(out, anchor)

    def test_gate_one_matches_bounded_correction(self) -> None:
        anchor = torch.tensor([[0.0], [1.0], [2.0], [3.0]]).reshape(4, 1, 1)
        traj = torch.tensor([[0.0], [2.0], [1.0], [5.0]]).reshape(4, 1, 1)
        x0 = torch.tensor([[0.0]])
        gates_one = torch.ones(4)
        bounded_only = apply_baseline_anchor(
            traj,
            x0,
            anchor,
            hard_bound=True,
            caps_by_horizon={1: 0.25, 2: 0.35, 3: 0.5, 4: 0.65},
            horizon_numbers=[1, 2, 3, 4],
            mean=0.0,
            std=1.0,
            use_log_transform=False,
        )
        gated_full = apply_baseline_anchor(
            traj,
            x0,
            anchor,
            hard_bound=True,
            caps_by_horizon={1: 0.25, 2: 0.35, 3: 0.5, 4: 0.65},
            horizon_numbers=[1, 2, 3, 4],
            mean=0.0,
            std=1.0,
            use_log_transform=False,
            correction_gates=gates_one,
        )
        assert torch.allclose(gated_full, bounded_only)

    def test_h1_gate_abstains_with_default_init(self) -> None:
        config = NeuralOdeConfig(
            correction_shrinkage_enabled=True,
            hard_correction_bound=True,
            correction_cap_h1=0.25,
        )
        model = NeuralODE(config)
        g1 = float(model.correction_gates(1)[0].item())
        assert g1 < 0.2

    def test_shrinkage_v2_conservative_init(self) -> None:
        config = node_config_from_profile("shrinkage_correction_v2")
        assert config.correction_gate_init_logits == (-3.0, -2.0, -1.0, -0.5)
        assert config.correction_gate_medium_horizon_penalty_weight >= 2.0
        model = NeuralODE(config)
        g2 = float(model.correction_gates(2)[1].item())
        assert g2 < 0.15

    def test_h4_abstain_profile_only_changes_h4(self) -> None:
        v2 = node_config_from_profile("shrinkage_correction_v2")
        h4 = node_config_from_profile("shrinkage_correction_h4_abstain")
        assert h4.correction_gate_init_logits[:3] == v2.correction_gate_init_logits[:3]
        assert h4.correction_gate_init_logits[3] < v2.correction_gate_init_logits[3]
        assert h4.correction_gate_h4_penalty_weight == 4.5
        assert h4.correction_gate_h1_penalty_weight == v2.correction_gate_h1_penalty_weight
        assert (
            h4.correction_gate_medium_horizon_penalty_weight
            == v2.correction_gate_medium_horizon_penalty_weight
        )
        model = NeuralODE(h4)
        g4 = float(model.correction_gates(4)[3].item())
        assert g4 < float(NeuralODE(v2).correction_gates(4)[3].item())


class TestImprovementMetrics:
    def test_aggregate_improvement_by_horizon(self) -> None:
        candidate = {
            ("state", "IL", "2024-01-01", 2): 0.4,
            ("state", "IL", "2024-01-08", 2): 0.4,
            ("state", "IL", "2024-01-01", 4): 0.7,
        }
        ensemble = {
            ("state", "IL", "2024-01-01", 2): 0.5,
            ("state", "IL", "2024-01-08", 2): 0.5,
            ("state", "IL", "2024-01-01", 4): 0.8,
        }
        out = aggregate_improvement_vs_ensemble(candidate, ensemble)
        assert out["overall"]["n_origins"] == 3
        assert out["overall"]["pct_improved"] == 1.0
        assert out["by_horizon"]["2"]["pct_improved"] == 1.0
        assert out["by_horizon"]["4"]["pct_improved"] == 1.0


class TestIntervalCalibration:
    def test_recalibrate_increases_sigma_when_errors_large(self) -> None:
        errors = {1: [0.1, 0.12, 0.11], 2: [0.5, 0.55, 0.6, 0.58]}
        calibrated, diag = recalibrate_residual_sigma_by_horizon(errors)
        assert calibrated["2"] > calibrated["1"]
        assert diag["by_horizon"]["2"]["sigma_multiplier"] is not None
