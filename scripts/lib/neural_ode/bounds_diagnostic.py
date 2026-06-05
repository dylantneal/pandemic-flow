"""Diagnostics for hard-bounded Neural ODE correction profiles."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from supabase import Client

from scripts.lib.forecast_db import REGIONS, fetch_region_history


@dataclass(frozen=True)
class BoundViolation:
    prediction_id: str
    entity_type: str
    entity_id: str
    forecast_origin_week: str
    predicted_activity_index: float
    origin_activity_index: float
    abs_delta: float
    allowed_delta: float


@dataclass(frozen=True)
class H1BoundResult:
    model_name: str
    version: str
    cap: float
    tolerance: float
    n_predictions: int
    max_abs_delta: float
    hard_bound_enabled: bool
    violations: list[BoundViolation] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return self.hard_bound_enabled and self.n_predictions > 0 and not self.violations


def _origin_actual_lookup(
    client: Client,
) -> dict[tuple[str, str, str], float]:
    lookup: dict[tuple[str, str, str], float] = {}
    for entity_type, entity_id, _ in REGIONS:
        for pt in fetch_region_history(client, entity_type, entity_id):
            lookup[(entity_type, entity_id, pt.week_start.isoformat())] = pt.value
    return lookup


def evaluate_h1_bound_rows(
    *,
    model_name: str,
    version: str,
    cap: float,
    tolerance: float,
    hard_bound_enabled: bool,
    predictions: list[dict[str, Any]],
    origin_actuals: dict[tuple[str, str, str], float],
) -> H1BoundResult:
    """Check h1 predictions cannot drift beyond the configured origin correction cap."""
    allowed = float(cap) + float(tolerance)
    max_abs_delta = 0.0
    violations: list[BoundViolation] = []
    n_predictions = 0

    for pred in predictions:
        key = (
            str(pred["entity_type"]),
            str(pred["entity_id"]),
            str(pred["forecast_origin_week"])[:10],
        )
        if key not in origin_actuals:
            continue
        n_predictions += 1
        origin = float(origin_actuals[key])
        predicted = float(pred["predicted_activity_index"])
        abs_delta = abs(predicted - origin)
        max_abs_delta = max(max_abs_delta, abs_delta)
        if abs_delta > allowed:
            violations.append(
                BoundViolation(
                    prediction_id=str(pred["id"]),
                    entity_type=str(pred["entity_type"]),
                    entity_id=str(pred["entity_id"]),
                    forecast_origin_week=str(pred["forecast_origin_week"])[:10],
                    predicted_activity_index=predicted,
                    origin_activity_index=origin,
                    abs_delta=abs_delta,
                    allowed_delta=allowed,
                )
            )

    return H1BoundResult(
        model_name=model_name,
        version=version,
        cap=float(cap),
        tolerance=float(tolerance),
        n_predictions=n_predictions,
        max_abs_delta=max_abs_delta,
        hard_bound_enabled=hard_bound_enabled,
        violations=violations,
    )


def _fetch_h1_predictions(client: Client, model_run_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page_size = 1000
    offset = 0
    while True:
        response = (
            client.table("predictions")
            .select(
                "id, entity_type, entity_id, forecast_origin_week, "
                "predicted_activity_index"
            )
            .eq("model_run_id", model_run_id)
            .eq("horizon_weeks", 1)
            .order("forecast_origin_week", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def _fetch_target_runs(
    client: Client,
    *,
    version: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> list[dict[str, Any]]:
    query = (
        client.table("model_runs")
        .select("id, model_name, version, hyperparameters")
        .eq("model_type", "neural_ode")
        .eq("version", version)
    )
    rows = query.execute().data or []
    if entity_type and entity_id:
        rows = [
            row
            for row in rows
            if (row.get("hyperparameters") or {}).get("entity_type") == entity_type
            and (row.get("hyperparameters") or {}).get("entity_id") == entity_id
        ]
    return rows


def check_h1_correction_bounds(
    client: Client,
    *,
    version: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    tolerance: float = 0.0001,
) -> list[H1BoundResult]:
    runs = _fetch_target_runs(
        client,
        version=version,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    origin_actuals = _origin_actual_lookup(client)
    results: list[H1BoundResult] = []

    for run in runs:
        hyper = run.get("hyperparameters") or {}
        model_config = hyper.get("model_config") or {}
        cap = float(model_config.get("correction_cap_h1", 0.25))
        hard_bound_enabled = bool(model_config.get("hard_correction_bound", False))
        predictions = _fetch_h1_predictions(client, str(run["id"]))
        results.append(
            evaluate_h1_bound_rows(
                model_name=str(run["model_name"]),
                version=str(run["version"]),
                cap=cap,
                tolerance=tolerance,
                hard_bound_enabled=hard_bound_enabled,
                predictions=predictions,
                origin_actuals=origin_actuals,
            )
        )

    return results


def format_h1_bound_report(results: list[H1BoundResult]) -> str:
    if not results:
        return "H1 correction-bound diagnostic: FAIL (no matching neural_ode model_runs)"

    lines = ["H1 correction-bound diagnostic"]
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        lines.append(
            f"  [{status}] {result.model_name} v{result.version}: "
            f"n={result.n_predictions}, cap={result.cap:.4f}, "
            f"tol={result.tolerance:.4f}, max_abs_delta={result.max_abs_delta:.4f}, "
            f"hard_bound={result.hard_bound_enabled}"
        )
        for violation in result.violations[:5]:
            lines.append(
                "    "
                f"{violation.entity_type}/{violation.entity_id} "
                f"origin={violation.forecast_origin_week} "
                f"pred={violation.predicted_activity_index:.4f} "
                f"origin_actual={violation.origin_activity_index:.4f} "
                f"abs_delta={violation.abs_delta:.4f} "
                f"allowed={violation.allowed_delta:.4f}"
            )
        if len(result.violations) > 5:
            lines.append(f"    ... {len(result.violations) - 5} more violations")
    return "\n".join(lines)
