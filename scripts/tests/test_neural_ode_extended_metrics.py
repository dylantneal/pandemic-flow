"""Tests for extended evaluation metrics."""

from __future__ import annotations

from scripts.lib.neural_ode.metrics import (
    aggregate_prediction_actuals,
    origin_regime_from_change,
    quality_segment_from_score,
)


def test_origin_regime_classification() -> None:
    assert origin_regime_from_change(0.5) == "rising"
    assert origin_regime_from_change(-0.5) == "falling"
    assert origin_regime_from_change(0.05) == "stable"
    assert origin_regime_from_change(0.24) == "turn_point"


def test_quality_segment() -> None:
    assert quality_segment_from_score(0.85) == "high"
    assert quality_segment_from_score(0.55) == "low"
    assert quality_segment_from_score(None) == "unknown"


def test_aggregate_includes_regime_quality_and_coverage() -> None:
    actuals = [
        {
            "prediction_id": "p1",
            "actual_activity_index": 1.0,
            "absolute_error": 0.2,
            "squared_error": 0.04,
            "trend_correct": True,
            "_origin_regime": "rising",
            "_quality_segment": "high",
            "_lower_bound": 0.5,
            "_upper_bound": 1.5,
        },
        {
            "prediction_id": "p2",
            "actual_activity_index": 2.5,
            "absolute_error": 0.5,
            "squared_error": 0.25,
            "trend_correct": False,
            "_origin_regime": "falling",
            "_quality_segment": "low",
            "_lower_bound": 2.0,
            "_upper_bound": 2.2,
        },
    ]
    pred_horizon = {"p1": 1, "p2": 2}
    metrics = aggregate_prediction_actuals(actuals, pred_horizon=pred_horizon)

    assert metrics["by_regime"]["rising"]["mae"] == 0.2
    assert metrics["by_regime"]["falling"]["mae"] == 0.5
    assert metrics["by_quality_segment"]["high"]["mae"] == 0.2
    assert metrics["by_quality_segment"]["low"]["mae"] == 0.5
    assert metrics["interval_coverage"]["overall"] == 0.5
    assert metrics["interval_coverage"]["n_intervals"] == 2
