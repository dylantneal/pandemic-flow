"""Tests for region-scoped promotion metrics."""

from __future__ import annotations

from scripts.lib.neural_ode.metrics import aggregate_prediction_actuals


def test_aggregate_filters_by_horizon() -> None:
    actuals = [
        {
            "prediction_id": "p1",
            "absolute_error": 0.2,
            "squared_error": 0.04,
            "trend_correct": True,
        },
        {
            "prediction_id": "p2",
            "absolute_error": 0.4,
            "squared_error": 0.16,
            "trend_correct": False,
        },
    ]
    pred_horizon = {"p1": 1, "p2": 2}
    metrics = aggregate_prediction_actuals(actuals, pred_horizon=pred_horizon)
    assert metrics["by_horizon"]["1"]["mae"] == 0.2
    assert metrics["by_horizon"]["2"]["mae"] == 0.4
    assert metrics["by_horizon"]["1"]["trend_accuracy"] == 1.0
    assert metrics["by_horizon"]["2"]["trend_accuracy"] == 0.0
    assert metrics["total_evaluations"] == 2
