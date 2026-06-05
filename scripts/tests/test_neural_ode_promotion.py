"""Tests for Neural ODE promotion gate."""

from __future__ import annotations

from scripts.lib.neural_ode.metrics import parse_entity_from_neural_model_name
from scripts.lib.neural_ode.versions import CANONICAL_RESEARCH_VERSION
from scripts.lib.neural_ode.promotion import (
    check_research_value,
    classify_production_status,
    classify_research_status,
    evaluate_promotion_gate,
    evaluate_promotion_gate_for_run,
    format_report,
)


def _metrics(
    *,
    mae1: float,
    mae2: float,
    mae4: float,
    rmse1: float = 0.4,
    rmse2: float = 0.5,
    rmse3: float = 0.6,
    rmse4: float = 0.7,
    trend1: float = 0.45,
) -> dict:
    return {
        "by_horizon": {
            "1": {"mae": mae1, "rmse": rmse1, "trend_accuracy": trend1, "n_evaluations": 12},
            "2": {"mae": mae2, "rmse": rmse2, "n_evaluations": 12},
            "3": {"mae": 0.6, "rmse": rmse3, "n_evaluations": 12},
            "4": {"mae": mae4, "rmse": rmse4, "n_evaluations": 12},
        }
    }


class TestPromotionGate:
    def test_passes_when_beats_baselines(self) -> None:
        candidate = _metrics(mae1=0.30, mae2=0.34, mae4=0.60, trend1=0.44)
        persistence = _metrics(mae1=0.32, mae2=0.40, mae4=0.80, trend1=0.47)
        ensemble = _metrics(mae1=0.35, mae2=0.36, mae4=0.59, trend1=0.40)

        report = evaluate_promotion_gate(
            candidate,
            persistence_metrics=persistence,
            ensemble_metrics=ensemble,
            model_name="neural_ode_IL",
            version="1.0.0",
        )
        assert report.passed

    def test_fails_when_1w_mae_worse_than_persistence(self) -> None:
        candidate = _metrics(mae1=0.40, mae2=0.34, mae4=0.60, trend1=0.50)
        persistence = _metrics(mae1=0.32, mae2=0.40, mae4=0.80, trend1=0.47)
        ensemble = _metrics(mae1=0.35, mae2=0.36, mae4=0.59, trend1=0.40)

        report = evaluate_promotion_gate(
            candidate,
            persistence_metrics=persistence,
            ensemble_metrics=ensemble,
        )
        assert not report.passed
        assert any(c.name == "1w_mae_vs_persistence" and not c.passed for c in report.checks)

    def test_fails_when_rmse_too_high(self) -> None:
        candidate = _metrics(mae1=0.30, mae2=0.34, mae4=0.60, rmse2=0.90)
        persistence = _metrics(mae1=0.32, mae2=0.40, mae4=0.80, trend1=0.47)
        ensemble = _metrics(mae1=0.35, mae2=0.36, mae4=0.59, rmse2=0.50)

        report = evaluate_promotion_gate(
            candidate,
            persistence_metrics=persistence,
            ensemble_metrics=ensemble,
        )
        assert not report.passed

    def test_reproducibility_metadata_required(self) -> None:
        candidate_row = {
            "model_name": "neural_ode_IL",
            "version": "1.0.0",
            "metrics": _metrics(mae1=0.30, mae2=0.34, mae4=0.60, trend1=0.44),
            "hyperparameters": {},
            "artifact_path": None,
            "git_commit": None,
        }
        baselines = {
            "persistence_v1": {"metrics": _metrics(mae1=0.32, mae2=0.40, mae4=0.80, trend1=0.47)},
            "ensemble_v1": {"metrics": _metrics(mae1=0.35, mae2=0.36, mae4=0.59)},
        }
        report = evaluate_promotion_gate_for_run(candidate_row, baselines)
        assert not report.passed
        assert any(c.name == "hyperparameters.seed" and not c.passed for c in report.checks)

    def test_parse_entity_from_model_name(self) -> None:
        assert parse_entity_from_neural_model_name("neural_ode_IL") == ("state", "IL")
        assert parse_entity_from_neural_model_name("neural_ode_17031") == (
            "county",
            "17031",
        )
        assert parse_entity_from_neural_model_name("persistence_v1") is None

    def test_fails_when_interval_coverage_missing(self) -> None:
        from scripts.lib.neural_ode.promotion import check_interval_coverage

        check = check_interval_coverage({})
        assert check.passed
        assert "skipped" in check.detail

    def test_fails_when_interval_coverage_out_of_band(self) -> None:
        from scripts.lib.neural_ode.promotion import check_interval_coverage

        check = check_interval_coverage({"interval_coverage": {"overall": 0.2, "n_intervals": 10}})
        assert not check.passed

    def test_regime_degradation_gate(self) -> None:
        from scripts.lib.neural_ode.promotion import check_regime_degradation

        candidate = {
            "by_regime": {
                "rising": {"mae": 0.8, "n_evaluations": 5},
                "falling": {"mae": 0.3, "n_evaluations": 5},
            }
        }
        ensemble = {
            "by_regime": {
                "rising": {"mae": 0.4, "n_evaluations": 5},
                "falling": {"mae": 0.4, "n_evaluations": 5},
            }
        }
        checks = check_regime_degradation(candidate, ensemble)
        rising = next(c for c in checks if c.name == "regime_rising_mae")
        falling = next(c for c in checks if c.name == "regime_falling_mae")
        assert not rising.passed
        assert falling.passed

    def test_format_report(self) -> None:
        report = evaluate_promotion_gate(
            _metrics(mae1=0.30, mae2=0.34, mae4=0.60),
            persistence_metrics=_metrics(mae1=0.32, mae2=0.40, mae4=0.80, trend1=0.47),
            ensemble_metrics=_metrics(mae1=0.35, mae2=0.36, mae4=0.59),
            model_name="neural_ode_IL",
            version="1.0.0",
        )
        text = format_report(report)
        assert "neural_ode_IL" in text
        assert "PASS" in text or "FAIL" in text

    def test_near_miss_when_only_4w_slightly_high(self) -> None:
        # ensemble 4w = 0.71 → limit 0.7455; candidate 0.773 → ~3.7% excess
        candidate = _metrics(mae1=0.24, mae2=0.49, mae4=0.773)
        persistence = _metrics(mae1=0.27, mae2=0.50, mae4=0.80, trend1=0.42)
        ensemble = _metrics(mae1=0.28, mae2=0.49, mae4=0.71, trend1=0.40)

        report = evaluate_promotion_gate(
            candidate,
            persistence_metrics=persistence,
            ensemble_metrics=ensemble,
        )
        assert not report.production_passed
        assert report.production_status == "near_miss"
        assert classify_production_status(report) == "near_miss"

    def test_fail_unsafe_when_multiple_production_checks_fail(self) -> None:
        candidate = _metrics(mae1=0.50, mae2=0.49, mae4=0.773)
        persistence = _metrics(mae1=0.27, mae2=0.50, mae4=0.80, trend1=0.42)
        ensemble = _metrics(mae1=0.28, mae2=0.49, mae4=0.71, trend1=0.40)

        report = evaluate_promotion_gate(
            candidate,
            persistence_metrics=persistence,
            ensemble_metrics=ensemble,
        )
        assert report.production_status == "fail"

    def test_research_h4_abstention_status(self) -> None:
        candidate = _metrics(mae1=0.24, mae2=0.49, mae4=0.773)
        persistence = _metrics(mae1=0.27, mae2=0.50, mae4=0.80, trend1=0.42)
        ensemble = _metrics(mae1=0.28, mae2=0.49, mae4=0.71, trend1=0.40)
        candidate["improvement_vs_ensemble"] = {
            "overall": {"n_origins": 16, "pct_improved": 0.50, "mean_delta_vs_ensemble": 0.01},
            "by_horizon": {
                "2": {"n_origins": 16, "pct_improved": 0.60, "mean_delta_vs_ensemble": 0.02},
                "4": {"n_origins": 12, "pct_improved": 0.0, "mean_delta_vs_ensemble": -0.05},
            },
        }
        candidate["correction_gates_by_horizon"] = {"1": 0.15, "2": 0.03, "4": 0.10}

        report = evaluate_promotion_gate(
            candidate,
            persistence_metrics=persistence,
            ensemble_metrics=ensemble,
        )
        assert report.research_status == "h4_abstention"
        assert classify_research_status(report) == "h4_abstention"

    def test_research_value_with_holdout_metrics(self) -> None:
        metrics = {
            **_metrics(mae1=0.24, mae2=0.40, mae4=0.58),
            "improvement_vs_ensemble": {
                "overall": {
                    "n_origins": 16,
                    "pct_improved": 0.50,
                    "mean_delta_vs_ensemble": 0.01,
                },
                "by_horizon": {
                    "2": {
                        "n_origins": 16,
                        "pct_improved": 0.60,
                        "mean_delta_vs_ensemble": 0.02,
                    },
                    "4": {
                        "n_origins": 16,
                        "pct_improved": 0.35,
                        "mean_delta_vs_ensemble": 0.0,
                    },
                },
            },
            "correction_gates_by_horizon": {"1": 0.15, "2": 0.03, "3": 0.07, "4": 0.10},
        }
        checks = check_research_value(metrics)
        assert all(c.passed for c in checks)
        assert not any("skipped" in c.detail for c in checks)
