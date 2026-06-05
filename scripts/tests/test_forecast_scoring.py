"""Tests for forecast scoring helpers (rescoring after inference upserts)."""

from __future__ import annotations

from scripts.lib.forecast_db import _filter_scorable_predictions


def test_filter_scorable_predictions_skips_scored_by_default() -> None:
    preds = [
        {"id": "a", "entity_type": "state", "entity_id": "IL", "target_date": "2024-01-01"},
        {"id": "b", "entity_type": "state", "entity_id": "IL", "target_date": "2024-01-08"},
    ]
    actuals = {("state", "IL", "2024-01-01"): 1.0, ("state", "IL", "2024-01-08"): 2.0}

    result = _filter_scorable_predictions(
        preds,
        scored_ids={"a"},
        actuals_map=actuals,
        include_scored=False,
    )

    assert len(result) == 1
    assert result[0]["id"] == "b"
    assert result[0]["_actual"] == 2.0


def test_filter_scorable_predictions_rescores_when_requested() -> None:
    preds = [
        {"id": "a", "entity_type": "state", "entity_id": "IL", "target_date": "2024-01-01"},
        {"id": "b", "entity_type": "state", "entity_id": "IL", "target_date": "2024-01-08"},
    ]
    actuals = {("state", "IL", "2024-01-01"): 1.0, ("state", "IL", "2024-01-08"): 2.0}

    result = _filter_scorable_predictions(
        preds,
        scored_ids={"a", "b"},
        actuals_map=actuals,
        include_scored=True,
    )

    assert {row["id"] for row in result} == {"a", "b"}
    assert result[0]["_actual"] == 1.0


def test_filter_scorable_predictions_requires_actual() -> None:
    preds = [
        {"id": "a", "entity_type": "state", "entity_id": "IL", "target_date": "2024-01-01"},
    ]

    result = _filter_scorable_predictions(
        preds,
        scored_ids=set(),
        actuals_map={},
        include_scored=True,
    )

    assert result == []
