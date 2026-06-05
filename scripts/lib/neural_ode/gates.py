"""Correction shrinkage gate helpers shared by training, inference, and metrics."""

from __future__ import annotations

from typing import Any


def correction_gates_metrics_dict(model: Any, *, max_horizons: int = 4) -> dict[str, Any]:
    """Serialize learned per-horizon gates for model_runs.metrics."""
    if not hasattr(model, "correction_gate_logits"):
        return {}
    gates = model.correction_gates(max_horizons)
    by_h = {
        str(h + 1): round(float(gates[h].item()), 4)
        for h in range(min(max_horizons, gates.numel()))
    }
    return {"correction_gates_by_horizon": by_h}
