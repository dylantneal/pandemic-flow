#!/usr/bin/env python3
"""
Compare canonical 1.7.5 vs narrow h4-abstention experiment (1.7.6).

Success (modest): production_status pass on holdout without h1/h2 regression
or loss of calibrated interval coverage vs 1.7.5.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.lib.config import load_config
from scripts.lib.forecast_db import (
    MODEL_NAMES,
    compute_model_run_region_metrics,
    create_client_from_config,
    holdout_origin_weeks_for_region,
)
from scripts.lib.neural_ode.promote_runner import region_scoped_baseline_metrics
from scripts.lib.neural_ode.promotion import (
    ENSEMBLE_4W_MAE_TOLERANCE,
    evaluate_promotion_gate,
    promotion_summary_dict,
)
from scripts.lib.neural_ode.train_runner import model_name_for_region

CANONICAL_VERSION = "1.7.5-shrinkage-conservative"
EXPERIMENT_VERSION = "1.7.6-shrinkage-h4-abstain"
REGIONS = (("state", "IL"), ("county", "17031"))


def _horizon_mae(metrics: dict[str, Any], h: int) -> float | None:
    block = (metrics.get("by_horizon") or {}).get(str(h)) or {}
    mae = block.get("mae")
    return float(mae) if mae is not None else None


def _h4_improvement(metrics: dict[str, Any]) -> dict[str, Any]:
    imp = metrics.get("improvement_vs_ensemble") or {}
    return (imp.get("by_horizon") or {}).get("4") or {}


def _gate_h4(metrics: dict[str, Any]) -> float | None:
    gates = metrics.get("correction_gates_by_horizon") or {}
    g = gates.get("4")
    return float(g) if g is not None else None


def _coverage(metrics: dict[str, Any]) -> float | None:
    cov = metrics.get("interval_coverage") or {}
    overall = cov.get("overall")
    return float(overall) if overall is not None else None


def fetch_run(client: Any, entity_type: str, entity_id: str, version: str) -> dict[str, Any] | None:
    model_name = model_name_for_region(entity_type, entity_id)
    resp = (
        client.table("model_runs")
        .select("*")
        .eq("model_name", model_name)
        .eq("version", version)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def holdout_metrics_for_run(
    client: Any,
    run: dict[str, Any],
    entity_type: str,
    entity_id: str,
) -> dict[str, Any]:
    origin_weeks = holdout_origin_weeks_for_region(client, entity_type, entity_id)
    return compute_model_run_region_metrics(
        client,
        str(run["id"]),
        entity_type,
        entity_id,
        origin_weeks=origin_weeks,
        model_run_row=run,
    )


def compare_region(
    client: Any,
    entity_type: str,
    entity_id: str,
) -> dict[str, Any]:
    baseline_runs = region_scoped_baseline_metrics(
        client, entity_type=entity_type, entity_id=entity_id,
        origin_weeks=holdout_origin_weeks_for_region(client, entity_type, entity_id),
    )
    ensemble = baseline_runs.get(MODEL_NAMES["ensemble"], {}).get("metrics") or {}
    persistence = baseline_runs.get(MODEL_NAMES["persistence"], {}).get("metrics") or {}
    e4 = _horizon_mae(ensemble, 4)
    limit4 = e4 * ENSEMBLE_4W_MAE_TOLERANCE if e4 is not None else None

    out: dict[str, Any] = {"entity_type": entity_type, "entity_id": entity_id}
    for label, version in (("canonical", CANONICAL_VERSION), ("experiment", EXPERIMENT_VERSION)):
        run = fetch_run(client, entity_type, entity_id, version)
        if not run:
            out[label] = {"missing": True, "version": version}
            continue
        metrics = holdout_metrics_for_run(client, run, entity_type, entity_id)
        report = evaluate_promotion_gate(
            metrics,
            persistence_metrics=persistence,
            ensemble_metrics=ensemble,
            model_name=str(run.get("model_name", "")),
            version=version,
        )
        h4_imp = _h4_improvement(metrics)
        out[label] = {
            "version": version,
            "mae_4w": _horizon_mae(metrics, 4),
            "mae_1w": _horizon_mae(metrics, 1),
            "mae_2w": _horizon_mae(metrics, 2),
            "limit_4w": limit4,
            "h4_pct_improved": h4_imp.get("pct_improved"),
            "h4_n_origins": h4_imp.get("n_origins"),
            "gate_h4": _gate_h4(metrics),
            "interval_coverage": _coverage(metrics),
            "production_status": report.production_status,
            "research_status": report.research_status,
            "promotion": promotion_summary_dict(report),
        }
    return out


def _fmt(value: Any, *, digits: int = 4) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def print_report(results: list[dict[str, Any]]) -> None:
    print(f"\nH4 abstention experiment: {CANONICAL_VERSION} vs {EXPERIMENT_VERSION}")
    print("Holdout-scoped metrics (same slice as promotion gate).\n")

    for row in results:
        et, eid = row["entity_type"], row["entity_id"]
        print(f"=== {et}/{eid} ===")
        canon = row.get("canonical") or {}
        exp = row.get("experiment") or {}
        if canon.get("missing"):
            print(f"  Missing canonical run {CANONICAL_VERSION}")
            continue
        if exp.get("missing"):
            print(f"  Missing experiment run {EXPERIMENT_VERSION}")
            print(f"  Train: python scripts/train_neural_ode.py --version {EXPERIMENT_VERSION} --profile shrinkage_correction_h4_abstain")
            continue

        print(
            f"  {'':22} {'canonical':>12} {'experiment':>12} {'delta':>10}"
        )
        for key, label in (
            ("mae_4w", "4w MAE"),
            ("mae_1w", "1w MAE"),
            ("mae_2w", "2w MAE"),
            ("gate_h4", "h4 gate"),
            ("h4_pct_improved", "h4 % improved"),
            ("interval_coverage", "80% coverage"),
        ):
            c = canon.get(key)
            e = exp.get(key)
            delta = ""
            if isinstance(c, (int, float)) and isinstance(e, (int, float)):
                delta = f"{e - c:+.4f}"
            print(f"  {label:22} {_fmt(c):>12} {_fmt(e):>12} {delta:>10}")

        print(f"  {'limit_4w (ensemble×1.05)':22} {_fmt(canon.get('limit_4w')):>12}")
        print(
            f"  {'production_status':22} {canon.get('production_status', '—'):>12} "
            f"{exp.get('production_status', '—'):>12}"
        )

        success = (
            exp.get("production_status") == "pass"
            and (canon.get("mae_1w") is None or exp.get("mae_1w") is None or exp["mae_1w"] <= canon["mae_1w"] * 1.02)
            and (canon.get("mae_2w") is None or exp.get("mae_2w") is None or exp["mae_2w"] <= canon["mae_2w"] * 1.02)
            and (
                canon.get("interval_coverage") is None
                or exp.get("interval_coverage") is None
                or abs(exp["interval_coverage"] - canon["interval_coverage"]) <= 0.08
            )
        )
        verdict = "SUCCESS (production pass, h1/h2 stable, coverage ok)" if success else "INCONCLUSIVE or FAIL"
        print(f"  Verdict: {verdict}\n")

        if exp.get("production_status") != "pass" and exp.get("mae_4w") and exp.get("limit_4w"):
            excess = (exp["mae_4w"] - exp["limit_4w"]) / exp["limit_4w"]
            print(
                f"  Note: If 4w MAE cannot beat ensemble×1.05, conclusion stands: "
                f"useful role is h1/h2 selective correction; h4 stays ensemble-like "
                f"(4w excess {excess:.1%}).\n"
            )


def main() -> int:
    client = create_client_from_config(load_config())
    results = [compare_region(client, et, eid) for et, eid in REGIONS]
    print_report(results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
