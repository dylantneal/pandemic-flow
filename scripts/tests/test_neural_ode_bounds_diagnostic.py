"""Tests for Neural ODE hard-bound diagnostics."""

from __future__ import annotations

import pytest

from scripts.lib.neural_ode.bounds_diagnostic import evaluate_h1_bound_rows


def test_h1_bound_rows_pass_when_predictions_within_cap() -> None:
    result = evaluate_h1_bound_rows(
        model_name="neural_ode_IL",
        version="1.7.2-hardbound",
        cap=0.25,
        tolerance=0.0001,
        hard_bound_enabled=True,
        predictions=[
            {
                "id": "pred-1",
                "entity_type": "state",
                "entity_id": "IL",
                "forecast_origin_week": "2024-01-01",
                "predicted_activity_index": 1.2499,
            }
        ],
        origin_actuals={("state", "IL", "2024-01-01"): 1.0},
    )

    assert result.passed is True
    assert result.n_predictions == 1
    assert result.max_abs_delta == pytest.approx(0.2499)


def test_h1_bound_rows_fail_when_prediction_exceeds_cap() -> None:
    result = evaluate_h1_bound_rows(
        model_name="neural_ode_IL",
        version="1.7.2-hardbound",
        cap=0.25,
        tolerance=0.0001,
        hard_bound_enabled=True,
        predictions=[
            {
                "id": "pred-1",
                "entity_type": "state",
                "entity_id": "IL",
                "forecast_origin_week": "2024-01-01",
                "predicted_activity_index": 1.251,
            }
        ],
        origin_actuals={("state", "IL", "2024-01-01"): 1.0},
    )

    assert result.passed is False
    assert len(result.violations) == 1
    assert result.violations[0].abs_delta == pytest.approx(0.251)


def test_h1_bound_rows_fail_when_hard_bound_disabled() -> None:
    result = evaluate_h1_bound_rows(
        model_name="neural_ode_IL",
        version="1.7.2-hardbound",
        cap=0.25,
        tolerance=0.0001,
        hard_bound_enabled=False,
        predictions=[
            {
                "id": "pred-1",
                "entity_type": "state",
                "entity_id": "IL",
                "forecast_origin_week": "2024-01-01",
                "predicted_activity_index": 1.0,
            }
        ],
        origin_actuals={("state", "IL", "2024-01-01"): 1.0},
    )

    assert result.passed is False
    assert result.violations == []
