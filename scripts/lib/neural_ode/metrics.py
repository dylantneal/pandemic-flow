"""Shared metric aggregation and trend diagnostics for Neural ODE."""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Sequence

from scripts.lib.forecast_baselines import (
    TREND_FALLING_THRESHOLD,
    TREND_RISING_THRESHOLD,
    trend_from_change,
)
from scripts.lib.forecast_db import compute_residual_stats

NOMINAL_INTERVAL_LEVEL = 0.80
Z_NOMINAL_80 = 1.281551565545
QUALITY_HIGH_THRESHOLD = 0.7
REGIME_BUCKETS = ("rising", "falling", "stable", "turn_point", "unknown")
QUALITY_BUCKETS = ("high", "low", "unknown")


@dataclass
class TrendDiagnostics:
    confusion: dict[str, int] = field(default_factory=dict)
    turn_point_total: int = 0
    turn_point_correct: int = 0
    n_evaluations: int = 0

    def to_dict(self) -> dict[str, Any]:
        turn_acc = (
            self.turn_point_correct / self.turn_point_total
            if self.turn_point_total > 0
            else None
        )
        return {
            "confusion": dict(self.confusion),
            "turn_point_total": self.turn_point_total,
            "turn_point_correct": self.turn_point_correct,
            "turn_point_accuracy": round(turn_acc, 4) if turn_acc is not None else None,
            "n_evaluations": self.n_evaluations,
        }


def trend_class_from_change(change: float) -> int:
    """0=falling, 1=stable, 2=rising (matches gate thresholds)."""
    label = trend_from_change(change)
    if label == "rising":
        return 2
    if label == "falling":
        return 0
    return 1


def trend_class_label(class_id: int) -> str:
    return ("falling", "stable", "rising")[class_id]


def is_turn_point_origin(change: float, *, margin: float = 0.10) -> bool:
    """
    Origins near trend thresholds are harder to classify.
    margin=0.10 -> |change| in [0.15, 0.35] around ±0.25 boundaries.
    """
    dist_rise = abs(change - TREND_RISING_THRESHOLD)
    dist_fall = abs(change + TREND_FALLING_THRESHOLD)
    return min(dist_rise, dist_fall) <= margin


def origin_regime_from_change(
    change: float | None,
    *,
    turn_point_margin: float = 0.10,
) -> str:
    """Classify forecast origin week into evaluation regime bucket."""
    if change is None:
        return "unknown"
    if is_turn_point_origin(change, margin=turn_point_margin):
        return "turn_point"
    label = trend_from_change(change)
    if label == "insufficient_data":
        return "unknown"
    return label


def quality_segment_from_score(
    quality_score: float | None,
    *,
    threshold: float = QUALITY_HIGH_THRESHOLD,
) -> str:
    if quality_score is None:
        return "unknown"
    return "high" if quality_score >= threshold else "low"


def _aggregate_error_group(group: list[dict[str, Any]]) -> dict[str, Any]:
    abs_errors = [float(g["absolute_error"]) for g in group]
    sq_errors = [float(g["squared_error"]) for g in group]
    trend_correct = [
        g["trend_correct"] for g in group if g.get("trend_correct") is not None
    ]
    mae = statistics.mean(abs_errors) if abs_errors else None
    rmse = (statistics.mean(sq_errors) ** 0.5) if sq_errors else None
    trend_acc = (
        sum(1 for t in trend_correct if t) / len(trend_correct)
        if trend_correct
        else None
    )
    return {
        "mae": round(mae, 4) if mae is not None else None,
        "rmse": round(rmse, 4) if rmse is not None else None,
        "trend_accuracy": round(trend_acc, 4) if trend_acc is not None else None,
        "n_evaluations": len(group),
    }


def _aggregate_interval_coverage(
    actuals: list[dict[str, Any]],
    *,
    pred_horizon: dict[str, int],
) -> dict[str, Any]:
    """Compute empirical coverage of nominal 80% forecast intervals."""
    overall = {"covered": 0, "total": 0}
    by_horizon: dict[int, dict[str, int]] = defaultdict(lambda: {"covered": 0, "total": 0})

    for row in actuals:
        lower = row.get("_lower_bound")
        upper = row.get("_upper_bound")
        actual = row.get("actual_activity_index")
        if lower is None or upper is None or actual is None:
            continue
        pred_id = row.get("prediction_id")
        horizon = pred_horizon.get(pred_id) if pred_id else row.get("horizon_weeks")
        if horizon is None:
            continue
        covered = float(lower) <= float(actual) <= float(upper)
        overall["total"] += 1
        by_horizon[int(horizon)]["total"] += 1
        if covered:
            overall["covered"] += 1
            by_horizon[int(horizon)]["covered"] += 1

    def _rate(block: dict[str, int]) -> float | None:
        if block["total"] <= 0:
            return None
        return round(block["covered"] / block["total"], 4)

    return {
        "nominal_level": NOMINAL_INTERVAL_LEVEL,
        "overall": _rate(overall),
        "n_intervals": overall["total"],
        "by_horizon": {
            str(h): _rate(block) for h, block in sorted(by_horizon.items())
        },
    }


def aggregate_prediction_actuals(
    actuals: list[dict[str, Any]],
    *,
    pred_horizon: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Build model_runs.metrics JSON from prediction_actuals rows."""
    if not actuals:
        return {}

    pred_horizon = pred_horizon or {}
    by_horizon: dict[int, list[dict[str, Any]]] = {}
    by_regime: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_quality: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in actuals:
        pred_id = row.get("prediction_id")
        h = pred_horizon.get(pred_id) if pred_id else row.get("horizon_weeks")
        if h is None:
            continue
        by_horizon.setdefault(int(h), []).append(row)

        regime = str(row.get("_origin_regime") or "unknown")
        if regime not in REGIME_BUCKETS:
            regime = "unknown"
        by_regime[regime].append(row)

        quality = str(row.get("_quality_segment") or "unknown")
        if quality not in QUALITY_BUCKETS:
            quality = "unknown"
        by_quality[quality].append(row)

    metrics: dict[str, Any] = {"by_horizon": {}, "residual_sigma_by_horizon": {}}
    errors_by_horizon: dict[int, list[float]] = {}

    for h, group in sorted(by_horizon.items()):
        block = _aggregate_error_group(group)
        metrics["by_horizon"][str(h)] = block
        errors_by_horizon[h] = [float(g["absolute_error"]) for g in group]

    residual = compute_residual_stats(errors_by_horizon)
    metrics["residual_sigma_by_horizon"] = {
        str(k): round(v, 4) for k, v in residual.by_horizon.items()
    }
    metrics["total_evaluations"] = len(actuals)

    regime_metrics: dict[str, Any] = {}
    for regime, group in sorted(by_regime.items()):
        if not group:
            continue
        regime_metrics[regime] = _aggregate_error_group(group)
    if regime_metrics:
        metrics["by_regime"] = regime_metrics

    quality_metrics: dict[str, Any] = {}
    for segment, group in sorted(by_quality.items()):
        if not group:
            continue
        quality_metrics[segment] = _aggregate_error_group(group)
    if quality_metrics:
        metrics["by_quality_segment"] = quality_metrics

    interval_coverage = _aggregate_interval_coverage(actuals, pred_horizon=pred_horizon)
    if interval_coverage.get("n_intervals", 0) > 0:
        metrics["interval_coverage"] = interval_coverage

    return metrics


def recalibrate_residual_sigma_by_horizon(
    errors_by_horizon: dict[int, list[float]],
    *,
    nominal_level: float = NOMINAL_INTERVAL_LEVEL,
) -> tuple[dict[str, float], dict[str, Any]]:
    """
    Calibrate residual sigmas from evaluated absolute errors so nominal intervals
    match empirical coverage (symmetric normal bands).
    """
    z = Z_NOMINAL_80 if nominal_level >= 0.79 else 1.96
    calibrated: dict[str, float] = {}
    diagnostic: dict[str, Any] = {
        "nominal_level": nominal_level,
        "z_multiplier": z,
        "by_horizon": {},
    }
    for h, errs in sorted(errors_by_horizon.items()):
        if not errs:
            continue
        sorted_abs = sorted(abs(float(e)) for e in errs)
        idx = min(
            len(sorted_abs) - 1,
            max(0, int(math.ceil(nominal_level * len(sorted_abs)) - 1)),
        )
        p_nominal = sorted_abs[idx]
        sigma = p_nominal / z if z > 0 else p_nominal
        calibrated[str(h)] = round(sigma, 4)
        raw_sigma = compute_residual_stats({h: errs}).by_horizon.get(h)
        multiplier = round(sigma / raw_sigma, 4) if raw_sigma and raw_sigma > 0 else None
        diagnostic["by_horizon"][str(h)] = {
            "n_errors": len(errs),
            "abs_error_percentile": round(p_nominal, 4),
            "sigma_raw": round(raw_sigma, 4) if raw_sigma is not None else None,
            "sigma_calibrated": calibrated[str(h)],
            "sigma_multiplier": multiplier,
        }
    return calibrated, diagnostic


def _improvement_origin_key(
    entity_type: str,
    entity_id: str,
    origin_week: str,
    horizon: int,
) -> tuple[str, str, str, int]:
    return (entity_type, entity_id, str(origin_week)[:10], int(horizon))


def aggregate_improvement_vs_ensemble(
    candidate_errors: dict[tuple[str, str, str, int], float],
    ensemble_errors: dict[tuple[str, str, str, int], float],
) -> dict[str, Any]:
    """
    Per-origin improvement rate vs ensemble on aligned (entity, origin, horizon) keys.
    """
    keys = set(candidate_errors) & set(ensemble_errors)
    if not keys:
        return {}

    by_horizon: dict[int, list[tuple[bool, float]]] = defaultdict(list)
    all_rows: list[tuple[bool, float]] = []

    for key in keys:
        c_err = candidate_errors[key]
        e_err = ensemble_errors[key]
        improved = c_err < e_err
        delta = e_err - c_err
        _, _, _, h = key
        by_horizon[h].append((improved, delta))
        all_rows.append((improved, delta))

    def _summarize(rows: list[tuple[bool, float]]) -> dict[str, Any]:
        if not rows:
            return {}
        n = len(rows)
        improved_n = sum(1 for imp, _ in rows if imp)
        deltas = [d for _, d in rows]
        return {
            "n_origins": n,
            "pct_improved": round(improved_n / n, 4),
            "mean_delta_vs_ensemble": round(statistics.mean(deltas), 4),
            "median_delta_vs_ensemble": round(statistics.median(deltas), 4),
        }

    out: dict[str, Any] = {"overall": _summarize(all_rows), "by_horizon": {}}
    for h in sorted(by_horizon):
        out["by_horizon"][str(h)] = _summarize(by_horizon[h])
    return out


def projected_interval_coverage(
    preds: list[dict[str, Any]],
    actuals_by_pred_id: dict[str, dict[str, Any]],
    *,
    pred_horizon: dict[str, int],
    sigma_by_horizon: dict[str, float],
    nominal_level: float = NOMINAL_INTERVAL_LEVEL,
) -> dict[str, Any]:
    """Coverage if intervals used recalibrated sigma around point forecasts."""
    z = Z_NOMINAL_80 if nominal_level >= 0.79 else 1.96
    overall = {"covered": 0, "total": 0}
    by_horizon: dict[int, dict[str, int]] = defaultdict(lambda: {"covered": 0, "total": 0})

    for pred in preds:
        pred_id = str(pred.get("id", ""))
        actual_row = actuals_by_pred_id.get(pred_id)
        if not actual_row:
            continue
        actual = actual_row.get("actual_activity_index")
        predicted = pred.get("predicted_activity_index")
        if actual is None or predicted is None:
            continue
        h = int(pred_horizon.get(pred_id, pred.get("horizon_weeks", 0)))
        sigma = float(sigma_by_horizon.get(str(h), sigma_by_horizon.get(h, 0.5)))
        half = z * sigma
        lower = float(predicted) - half
        upper = float(predicted) + half
        covered = lower <= float(actual) <= upper
        overall["total"] += 1
        by_horizon[h]["total"] += 1
        if covered:
            overall["covered"] += 1
            by_horizon[h]["covered"] += 1

    def _rate(block: dict[str, int]) -> float | None:
        if block["total"] <= 0:
            return None
        return round(block["covered"] / block["total"], 4)

    return {
        "nominal_level": nominal_level,
        "overall": _rate(overall),
        "n_intervals": overall["total"],
        "by_horizon": {str(h): _rate(block) for h, block in sorted(by_horizon.items())},
    }


def compute_trend_diagnostics_1w(
    actuals_h1: list[dict[str, Any]],
    *,
    pred_by_id: dict[str, dict[str, Any]] | None = None,
    turn_point_margin: float = 0.10,
) -> TrendDiagnostics:
    """
    Build 1w trend confusion and turn-point subset stats from scored rows.
    Requires prediction rows with predicted_trend when pred_by_id is provided.
    """
    diag = TrendDiagnostics()
    confusion: dict[str, int] = {
        "falling->falling": 0,
        "falling->stable": 0,
        "falling->rising": 0,
        "stable->falling": 0,
        "stable->stable": 0,
        "stable->rising": 0,
        "rising->falling": 0,
        "rising->stable": 0,
        "rising->rising": 0,
    }

    for row in actuals_h1:
        actual = float(row.get("actual_activity_index", 0))
        origin_actual = row.get("_origin_actual")
        if origin_actual is None:
            continue
        change = actual - float(origin_actual)
        actual_cls = trend_class_label(trend_class_from_change(change))

        pred_trend = row.get("predicted_trend")
        if pred_trend is None and pred_by_id:
            pred = pred_by_id.get(str(row.get("prediction_id", "")))
            if pred:
                pred_trend = pred.get("predicted_trend")
        if not pred_trend or pred_trend == "insufficient_data":
            continue

        key = f"{actual_cls}->{pred_trend}"
        if key in confusion:
            confusion[key] += 1
        diag.n_evaluations += 1

        if is_turn_point_origin(change, margin=turn_point_margin):
            diag.turn_point_total += 1
            if pred_trend == actual_cls:
                diag.turn_point_correct += 1

    diag.confusion = confusion
    return diag


def parse_entity_from_neural_model_name(model_name: str) -> tuple[str, str] | None:
    """Parse neural_ode_{entity_id} -> (entity_type, entity_id)."""
    if not model_name.startswith("neural_ode_"):
        return None
    entity_id = model_name.removeprefix("neural_ode_")
    if entity_id == "IL":
        return "state", "IL"
    if entity_id.isdigit():
        return "county", entity_id
    return None
