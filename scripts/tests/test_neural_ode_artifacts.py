"""Tests for Neural ODE checkpoint save/load."""

from __future__ import annotations

import json
from pathlib import Path

import torch

from scripts.lib.neural_ode.covariates import CovariateStats
from scripts.lib.neural_ode.artifacts import load_checkpoint, save_checkpoint_bundle, write_training_curve
from scripts.lib.neural_ode.model import NeuralODE, NeuralOdeConfig


class TestCheckpointBundle:
    def test_save_load_roundtrip(self, tmp_path: Path) -> None:
        model = NeuralODE(
            NeuralOdeConfig(
                state_dim=2,
                hidden_dim=8,
                depth=2,
                residual_on_persistence=True,
                log_target=True,
            )
        )
        path = save_checkpoint_bundle(
            model=model,
            mean=2.5,
            std=0.8,
            entity_type="state",
            entity_id="IL",
            version="1.0.0",
            out_dir=tmp_path,
            covariate_stats=CovariateStats(
                means={"quality_score": 0.8},
                stds={"quality_score": 0.1},
            ),
        )
        assert path.exists()

        loaded, mean, std, bundle, cov = load_checkpoint(path)
        assert abs(mean - 2.5) < 1e-6
        assert abs(std - 0.8) < 1e-6
        assert bundle["entity_id"] == "IL"
        assert cov is not None

        x0 = torch.tensor([[0.0]])
        t_eval = torch.tensor([0.0, 1.0])
        orig = model(x0, t_eval)
        replica = loaded(x0, t_eval)
        assert torch.allclose(orig, replica, atol=1e-5)

    def test_training_curve_json(self, tmp_path: Path) -> None:
        curve = [{"epoch": 1.0, "train_loss": 0.5, "val_loss": 0.6}]
        path = write_training_curve(tmp_path, curve)
        data = json.loads(path.read_text())
        assert data[0]["epoch"] == 1.0
