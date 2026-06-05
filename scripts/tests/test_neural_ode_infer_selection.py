"""Tests for Neural ODE inference model selection."""

from __future__ import annotations

from unittest.mock import MagicMock

from scripts.lib.neural_ode.infer_db import fetch_neural_ode_model_run


def test_fetch_by_version_prefers_explicit_version() -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "run-v17",
                "model_name": "neural_ode_IL",
                "version": "1.7.0",
                "status": "candidate",
                "artifact_path": "path",
                "metrics": {},
                "hyperparameters": {},
            }
        ]
    )

    row = fetch_neural_ode_model_run(
        client,
        "state",
        "IL",
        status=None,
        version="1.7.0",
    )
    assert row is not None
    assert row["version"] == "1.7.0"
    assert row["id"] == "run-v17"


def test_fetch_by_model_run_id() -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "uuid-123",
                "model_name": "neural_ode_17031",
                "version": "1.7.0",
                "status": "candidate",
                "artifact_path": "path",
                "metrics": {},
                "hyperparameters": {},
            }
        ]
    )

    row = fetch_neural_ode_model_run(
        client,
        "county",
        "17031",
        model_run_id="uuid-123",
    )
    assert row is not None
    assert row["id"] == "uuid-123"
