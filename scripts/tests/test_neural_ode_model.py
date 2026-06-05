"""Tests for vanilla Neural ODE model."""

from __future__ import annotations

import torch

from scripts.lib.neural_ode.model import (
    NeuralODE,
    NeuralOdeConfig,
    ODEFunc,
    huber_loss,
    weighted_huber_loss,
)


class TestODEFunc:
    def test_output_shape(self) -> None:
        func = ODEFunc(state_dim=1, hidden_dim=16, depth=2)
        x = torch.tensor([[0.5], [1.0]])
        dx = func(torch.tensor(0.0), x)
        assert dx.shape == (2, 1)


class TestNeuralODE:
    def test_forward_trajectory_shape(self) -> None:
        model = NeuralODE(NeuralOdeConfig(hidden_dim=16, depth=2))
        x0 = torch.tensor([[0.2]])
        t_eval = torch.tensor([0.0, 1.0, 2.0, 3.0, 4.0])
        traj = model(x0, t_eval)
        assert traj.shape == (5, 1, 1)

    def test_gradient_flows(self) -> None:
        model = NeuralODE(NeuralOdeConfig(hidden_dim=8, depth=2))
        x0 = torch.tensor([[0.0]], requires_grad=False)
        t_eval = torch.tensor([0.0, 1.0, 2.0])
        y = torch.tensor([[0.0], [0.1], [0.2]])
        traj = model(x0, t_eval)
        loss = huber_loss(traj, y)
        loss.backward()
        has_grad = any(p.grad is not None and p.grad.abs().sum() > 0 for p in model.parameters())
        assert has_grad

    def test_derivative_at(self) -> None:
        model = NeuralODE()
        x = torch.tensor([[1.0]])
        d = model.derivative_at(torch.tensor(0.5), x)
        assert d.shape == (1, 1)
        assert torch.isfinite(d).all()

    def test_augmented_residual_mode_keeps_origin_at_t0(self) -> None:
        model = NeuralODE(
            NeuralOdeConfig(
                state_dim=2,
                hidden_dim=8,
                depth=2,
                residual_on_persistence=True,
            )
        )
        x0 = torch.tensor([[0.4]])
        t_eval = torch.tensor([0.0, 1.0, 2.0])
        state = model.forward_state(x0, t_eval)
        obs = model(x0, t_eval)
        assert state.shape == (3, 1, 2)
        assert obs.shape == (3, 1, 1)
        assert torch.allclose(obs[0], x0, atol=1e-6)
        d = model.derivative_observed_at(torch.tensor(0.5), state[1, 0, :].unsqueeze(0))
        assert d.shape == (1, 1)
        assert torch.isfinite(d).all()


class TestHuberLoss:
    def test_zero_at_target(self) -> None:
        pred = torch.tensor([[1.0], [2.0]])
        loss = huber_loss(pred, pred.clone())
        assert loss.item() == 0.0

    def test_weighted_matches_unweighted_when_equal(self) -> None:
        pred = torch.tensor([[0.0], [0.3], [0.6]])
        target = torch.tensor([[0.0], [0.2], [0.5]])
        weights = torch.tensor([1.0, 1.0, 1.0])
        w = weighted_huber_loss(pred, target, weights)
        u = huber_loss(pred, target)
        assert abs(w.item() - u.item()) < 1e-8
