"""Promotion gate: compare Neural ODE holdout metrics against production baselines."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from scripts.lib.forecast_db import MODEL_NAMES

HORIZONS = (1, 2, 3, 4)
ENSEMBLE_4W_MAE_TOLERANCE = 1.05
RMSE_MAX_RATIO_ABOVE_ENSEMBLE = 1.20
TREND_ACCURACY_TOLERANCE_PP = 0.05
MIN_INTERVAL_COVERAGE = 0.55
MAX_INTERVAL_COVERAGE = 0.98
REGIME_MAE_DEGRADATION_RATIO = 1.35
REGIME_BUCKETS_FOR_GATE = ("rising", "falling", "stable", "turn_point")
MIN_REGIME_EVALUATIONS = 3
MIN_RESEARCH_IMPROVEMENT_PCT_H2 = 0.35
MIN_RESEARCH_IMPROVEMENT_PCT_H4 = 0.30
MIN_RESEARCH_ORIGINS = 10
# 4w MAE slightly above ensemble×1.05 but within this relative excess → near_miss (not unsafe).
NEAR_MISS_4W_MAX_RELATIVE_EXCESS = 0.08

ProductionStatus = Literal["pass", "near_miss", "fail"]
ResearchStatus = Literal["pass", "h4_abstention", "fail"]


@dataclass(frozen=True)
class GateCheck:
    name: str
    passed: bool
    detail: str
    tier: str = "production"


@dataclass
class PromotionReport:
    model_name: str
    version: str
    passed: bool
    production_passed: bool = True
    research_passed: bool = True
    production_status: ProductionStatus = "pass"
    research_status: ResearchStatus = "pass"
    checks: list[GateCheck] = field(default_factory=list)

    def add(
        self,
        name: str,
        passed: bool,
        detail: str,
        *,
        tier: str = "production",
    ) -> None:
        self.checks.append(
            GateCheck(name=name, passed=passed, detail=detail, tier=tier)
        )
        if tier == "research":
            if not passed:
                self.research_passed = False
            return
        if not passed:
            self.production_passed = False
            self.passed = False


def _horizon_block(metrics: dict[str, Any], horizon: int) -> dict[str, Any]:
    by_h = metrics.get("by_horizon") or {}
    block = by_h.get(str(horizon)) or by_h.get(horizon)
    return block if isinstance(block, dict) else {}


def _metric(block: dict[str, Any], key: str) -> float | None:
    value = block.get(key)
    if value is None:
        return None
    return float(value)


def check_reproducibility_metadata(model_run: dict[str, Any]) -> list[GateCheck]:
    """Proxy checks for §7 reproducibility contract (train-twice not re-run here)."""
    checks: list[GateCheck] = []
    hyper = model_run.get("hyperparameters") or {}

    for key in ("seed", "data_hash"):
        ok = bool(hyper.get(key))
        checks.append(
            GateCheck(
                name=f"hyperparameters.{key}",
                passed=ok,
                detail="present" if ok else f"missing {key} in hyperparameters",
            )
        )

    artifact_ok = bool(model_run.get("artifact_path"))
    checks.append(
        GateCheck(
            name="artifact_path",
            passed=artifact_ok,
            detail=model_run.get("artifact_path") or "missing artifact_path",
        )
    )

    git_ok = bool(model_run.get("git_commit"))
    checks.append(
        GateCheck(
            name="git_commit",
            passed=git_ok,
            detail=model_run.get("git_commit") or "missing git_commit (recommended)",
        )
    )
    return checks


def _regime_block(metrics: dict[str, Any], regime: str) -> dict[str, Any]:
    by_regime = metrics.get("by_regime") or {}
    block = by_regime.get(regime) or by_regime.get(str(regime))
    return block if isinstance(block, dict) else {}


def check_interval_coverage(metrics: dict[str, Any]) -> GateCheck:
    coverage = metrics.get("interval_coverage") or {}
    overall = coverage.get("overall")
    n_intervals = int(coverage.get("n_intervals") or 0)
    if overall is None or n_intervals <= 0:
        return GateCheck(
            name="interval_coverage",
            passed=True,
            detail="skipped (no interval coverage data; run evaluate_forecasts after rolling inference)",
        )
    passed = MIN_INTERVAL_COVERAGE <= float(overall) <= MAX_INTERVAL_COVERAGE
    detail = (
        f"empirical coverage {float(overall):.4f} "
        f"(required {MIN_INTERVAL_COVERAGE:.2f}–{MAX_INTERVAL_COVERAGE:.2f}, n={n_intervals})"
    )
    calibration = metrics.get("interval_calibration") or {}
    by_h = calibration.get("by_horizon") or {}
    if by_h:
        multipliers = [
            f"h{h}×{block['sigma_multiplier']}"
            for h, block in sorted(by_h.items())
            if isinstance(block, dict) and block.get("sigma_multiplier") is not None
        ]
        if multipliers:
            detail += f"; recalibration multipliers: {', '.join(multipliers)}"
    projected = metrics.get("interval_coverage_projected") or {}
    proj_overall = projected.get("overall")
    if proj_overall is not None:
        detail += f"; projected coverage after sigma recalibration {float(proj_overall):.4f}"
    return GateCheck(
        name="interval_coverage",
        passed=passed,
        detail=detail,
    )


def check_regime_degradation(
    candidate_metrics: dict[str, Any],
    ensemble_metrics: dict[str, Any],
) -> list[GateCheck]:
    """Candidate MAE in each major regime must not exceed ensemble by too much."""
    checks: list[GateCheck] = []
    for regime in REGIME_BUCKETS_FOR_GATE:
        c_block = _regime_block(candidate_metrics, regime)
        e_block = _regime_block(ensemble_metrics, regime)
        c_mae = _metric(c_block, "mae")
        e_mae = _metric(e_block, "mae")
        n_eval = int(c_block.get("n_evaluations") or 0)
        if n_eval < MIN_REGIME_EVALUATIONS:
            checks.append(
                GateCheck(
                    name=f"regime_{regime}_mae",
                    passed=True,
                    detail=f"skipped (only {n_eval} evaluations; need {MIN_REGIME_EVALUATIONS})",
                )
            )
            continue
        if c_mae is None or e_mae is None:
            checks.append(
                GateCheck(
                    name=f"regime_{regime}_mae",
                    passed=False,
                    detail=f"missing regime MAE (candidate={c_mae}, ensemble={e_mae})",
                )
            )
            continue
        limit = e_mae * REGIME_MAE_DEGRADATION_RATIO
        checks.append(
            GateCheck(
                name=f"regime_{regime}_mae",
                passed=c_mae <= limit,
                detail=(
                    f"candidate {c_mae:.4f} {'<=' if c_mae <= limit else '>'} "
                    f"ensemble×{REGIME_MAE_DEGRADATION_RATIO} ({limit:.4f}, n={n_eval})"
                ),
            )
        )
    return checks


def classify_production_status(report: PromotionReport) -> ProductionStatus:
    """
    pass: all production checks pass.
    near_miss: only 4w MAE vs ensemble fails, and excess is small (safe but weak h4 lift).
    fail: any other production failure (unsafe or broad underperformance).
    """
    if report.production_passed:
        return "pass"

    failed_prod = [c for c in report.checks if c.tier == "production" and not c.passed]
    if len(failed_prod) != 1 or failed_prod[0].name != "4w_mae_vs_ensemble":
        return "fail"

    check = failed_prod[0]
    match = re.search(
        r"candidate\s+([\d.]+)\s+>\s+ensemble×[\d.]+\s+\(([\d.]+)\)",
        check.detail,
    )
    if not match:
        return "fail"
    candidate_mae = float(match.group(1))
    limit = float(match.group(2))
    if limit <= 0:
        return "fail"
    excess_ratio = (candidate_mae - limit) / limit
    if excess_ratio <= NEAR_MISS_4W_MAX_RELATIVE_EXCESS:
        return "near_miss"
    return "fail"


def classify_research_status(report: PromotionReport) -> ResearchStatus:
    """
    pass: all research checks pass.
    h4_abstention: only h4 improvement fails while conservative gates pass (expected abstention).
    fail: broader research underperformance.
    """
    if report.research_passed:
        return "pass"
    failed = {c.name for c in report.checks if c.tier == "research" and not c.passed}
    if failed == {"improvement_h4"}:
        gates = next(
            (c for c in report.checks if c.name == "correction_gates_conservative"),
            None,
        )
        if gates and gates.passed:
            return "h4_abstention"
    return "fail"


def promotion_summary_dict(report: PromotionReport) -> dict[str, Any]:
    """Serializable promotion snapshot for model_runs.metrics."""
    return {
        "production_status": report.production_status,
        "production_passed": report.production_passed,
        "research_status": report.research_status,
        "research_passed": report.research_passed,
        "promote": report.passed,
        "holdout_scoped": True,
        "failed_production_checks": [
            c.name for c in report.checks if c.tier == "production" and not c.passed
        ],
        "failed_research_checks": [
            c.name for c in report.checks if c.tier == "research" and not c.passed
        ],
    }


def check_research_value(metrics: dict[str, Any]) -> list[GateCheck]:
    """
    Research-tier gate: selective correction should beat ensemble on enough origins.
    Does not block production promotion; tracked separately as research_passed.
    """
    checks: list[GateCheck] = []
    imp = metrics.get("improvement_vs_ensemble") or {}
    overall = imp.get("overall") or {}
    n_overall = int(overall.get("n_origins") or 0)
    if n_overall < MIN_RESEARCH_ORIGINS:
        checks.append(
            GateCheck(
                name="improvement_overall",
                passed=True,
                detail=f"skipped (only {n_overall} aligned origins; need {MIN_RESEARCH_ORIGINS})",
                tier="research",
            )
        )
    else:
        pct = overall.get("pct_improved")
        delta = overall.get("mean_delta_vs_ensemble")
        passed = pct is not None and float(pct) >= 0.33 and (delta or 0) >= 0
        checks.append(
            GateCheck(
                name="improvement_overall",
                passed=passed,
                detail=(
                    f"{float(pct):.1%} origins improved, mean delta vs ensemble {float(delta):+.4f} "
                    f"(n={n_overall})"
                    if pct is not None and delta is not None
                    else "missing improvement_vs_ensemble overall"
                ),
                tier="research",
            )
        )

    for h, threshold in ((2, MIN_RESEARCH_IMPROVEMENT_PCT_H2), (4, MIN_RESEARCH_IMPROVEMENT_PCT_H4)):
        block = (imp.get("by_horizon") or {}).get(str(h)) or {}
        n = int(block.get("n_origins") or 0)
        pct = block.get("pct_improved")
        delta = block.get("mean_delta_vs_ensemble")
        if n < MIN_RESEARCH_ORIGINS:
            checks.append(
                GateCheck(
                    name=f"improvement_h{h}",
                    passed=True,
                    detail=f"skipped (only {n} origins; need {MIN_RESEARCH_ORIGINS})",
                    tier="research",
                )
            )
            continue
        passed = pct is not None and float(pct) >= threshold
        checks.append(
            GateCheck(
                name=f"improvement_h{h}",
                passed=passed,
                detail=(
                    f"h{h}: {float(pct):.1%} improved (need {threshold:.0%}), "
                    f"mean delta {float(delta):+.4f} (n={n})"
                    if pct is not None and delta is not None
                    else f"missing improvement data for h{h}"
                ),
                tier="research",
            )
        )

    gates = metrics.get("correction_gates_by_horizon") or {}
    if gates:
        g2 = gates.get("2")
        g4 = gates.get("4")
        detail_parts = []
        if g2 is not None:
            detail_parts.append(f"h2 gate={float(g2):.3f}")
        if g4 is not None:
            detail_parts.append(f"h4 gate={float(g4):.3f}")
        conservative = True
        if g2 is not None and float(g2) > 0.35:
            conservative = False
        if g4 is not None and float(g4) > 0.45:
            conservative = False
        checks.append(
            GateCheck(
                name="correction_gates_conservative",
                passed=conservative,
                detail=", ".join(detail_parts) or "gates present",
                tier="research",
            )
        )
    else:
        checks.append(
            GateCheck(
                name="correction_gates_conservative",
                passed=True,
                detail="skipped (no correction_gates_by_horizon in metrics)",
                tier="research",
            )
        )
    return checks


def evaluate_promotion_gate(
    candidate_metrics: dict[str, Any],
    *,
    persistence_metrics: dict[str, Any],
    ensemble_metrics: dict[str, Any],
    model_name: str = "",
    version: str = "",
) -> PromotionReport:
    """
    Compare candidate holdout metrics (from training) to production baseline metrics.
    """
    report = PromotionReport(model_name=model_name, version=version, passed=True)

    # 1w MAE vs persistence
    c1 = _metric(_horizon_block(candidate_metrics, 1), "mae")
    p1 = _metric(_horizon_block(persistence_metrics, 1), "mae")
    if c1 is None or p1 is None:
        report.add("1w_mae_vs_persistence", False, f"missing data (candidate={c1}, persistence={p1})")
    else:
        report.add(
            "1w_mae_vs_persistence",
            c1 <= p1,
            f"candidate {c1:.4f} {'<=' if c1 <= p1 else '>'} persistence {p1:.4f}",
        )

    # 2w MAE vs ensemble
    c2 = _metric(_horizon_block(candidate_metrics, 2), "mae")
    e2 = _metric(_horizon_block(ensemble_metrics, 2), "mae")
    if c2 is None or e2 is None:
        report.add("2w_mae_vs_ensemble", False, f"missing data (candidate={c2}, ensemble={e2})")
    else:
        report.add(
            "2w_mae_vs_ensemble",
            c2 <= e2,
            f"candidate {c2:.4f} {'<=' if c2 <= e2 else '>'} ensemble {e2:.4f}",
        )

    # 4w MAE vs ensemble × 1.05
    c4 = _metric(_horizon_block(candidate_metrics, 4), "mae")
    e4 = _metric(_horizon_block(ensemble_metrics, 4), "mae")
    limit4 = e4 * ENSEMBLE_4W_MAE_TOLERANCE if e4 is not None else None
    if c4 is None or limit4 is None:
        report.add("4w_mae_vs_ensemble", False, f"missing data (candidate={c4}, ensemble={e4})")
    else:
        report.add(
            "4w_mae_vs_ensemble",
            c4 <= limit4,
            f"candidate {c4:.4f} {'<=' if c4 <= limit4 else '>'} ensemble×{ENSEMBLE_4W_MAE_TOLERANCE} ({limit4:.4f})",
        )

    # 1w trend accuracy vs persistence − 5pp
    ct = _metric(_horizon_block(candidate_metrics, 1), "trend_accuracy")
    pt = _metric(_horizon_block(persistence_metrics, 1), "trend_accuracy")
    min_trend = (pt - TREND_ACCURACY_TOLERANCE_PP) if pt is not None else None
    if ct is None or min_trend is None:
        report.add("1w_trend_vs_persistence", False, f"missing data (candidate={ct}, persistence={pt})")
    else:
        report.add(
            "1w_trend_vs_persistence",
            ct >= min_trend,
            f"candidate {ct:.4f} {'>=' if ct >= min_trend else '<'} persistence−{TREND_ACCURACY_TOLERANCE_PP:.2f} ({min_trend:.4f})",
        )

    # RMSE not > 20% above ensemble at any horizon
    for h in HORIZONS:
        cr = _metric(_horizon_block(candidate_metrics, h), "rmse")
        er = _metric(_horizon_block(ensemble_metrics, h), "rmse")
        if cr is None or er is None:
            report.add(f"{h}w_rmse_vs_ensemble", False, f"missing data (candidate={cr}, ensemble={er})")
            continue
        limit = er * RMSE_MAX_RATIO_ABOVE_ENSEMBLE
        report.add(
            f"{h}w_rmse_vs_ensemble",
            cr <= limit,
            f"candidate {cr:.4f} {'<=' if cr <= limit else '>'} ensemble×{RMSE_MAX_RATIO_ABOVE_ENSEMBLE} ({limit:.4f})",
        )

    coverage_check = check_interval_coverage(candidate_metrics)
    report.add(coverage_check.name, coverage_check.passed, coverage_check.detail)

    for regime_check in check_regime_degradation(candidate_metrics, ensemble_metrics):
        report.add(regime_check.name, regime_check.passed, regime_check.detail)

    for research_check in check_research_value(candidate_metrics):
        report.add(
            research_check.name,
            research_check.passed,
            research_check.detail,
            tier="research",
        )

    report.production_status = classify_production_status(report)
    report.research_status = classify_research_status(report)
    return report


def evaluate_promotion_gate_for_run(
    candidate: dict[str, Any],
    baseline_runs: dict[str, dict[str, Any]],
) -> PromotionReport:
    """Build report for one candidate model_run row."""
    persistence = baseline_runs.get(MODEL_NAMES["persistence"], {}).get("metrics") or {}
    ensemble = baseline_runs.get(MODEL_NAMES["ensemble"], {}).get("metrics") or {}
    candidate_metrics = candidate.get("metrics") or {}

    report = evaluate_promotion_gate(
        candidate_metrics,
        persistence_metrics=persistence,
        ensemble_metrics=ensemble,
        model_name=str(candidate.get("model_name", "")),
        version=str(candidate.get("version", "")),
    )

    for check in check_reproducibility_metadata(candidate):
        report.add(check.name, check.passed, check.detail)

    return report


def _production_status_label(status: ProductionStatus) -> str:
    if status == "pass":
        return "PASS"
    if status == "near_miss":
        return "NEAR MISS (safe; 4w lift short)"
    return "FAIL"


def _research_status_label(status: ResearchStatus) -> str:
    if status == "pass":
        return "PASS"
    if status == "h4_abstention":
        return "PASS (h4 abstention expected)"
    return "FAIL"


def format_report(report: PromotionReport) -> str:
    prod_checks = [c for c in report.checks if c.tier == "production"]
    research_checks = [c for c in report.checks if c.tier == "research"]
    lines = [
        f"Promotion gate: {report.model_name} v{report.version}",
        f"  Production safety: {'PASS' if report.production_passed else 'FAIL'}",
        f"  Production status: {_production_status_label(report.production_status)}",
        f"  Research value:    {_research_status_label(report.research_status)}",
        f"  Promote:           {'YES' if report.passed else 'NO'} (production only)",
        "",
        "  --- Production safety ---",
    ]
    for check in prod_checks:
        status = "PASS" if check.passed else "FAIL"
        lines.append(f"  [{status}] {check.name}: {check.detail}")
    if research_checks:
        lines.append("")
        lines.append("  --- Research value ---")
        for check in research_checks:
            status = "PASS" if check.passed else "FAIL"
            lines.append(f"  [{status}] {check.name}: {check.detail}")
    return "\n".join(lines)
