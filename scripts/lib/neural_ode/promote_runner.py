"""Promote Neural ODE candidate model runs to production after gate checks."""

from __future__ import annotations

import logging
import sys
from typing import Any

from supabase import Client

from scripts.lib.config import IngestionConfig, load_config
from scripts.lib.forecast_db import (
    MODEL_NAMES,
    compute_model_run_region_metrics,
    create_client_from_config,
    fetch_model_run_ids,
    fetch_model_runs_with_metrics,
    holdout_origin_weeks_for_region,
    merge_model_run_metrics,
)
from scripts.lib.neural_ode.metrics import parse_entity_from_neural_model_name
from scripts.lib.neural_ode.promotion import (
    check_reproducibility_metadata,
    evaluate_promotion_gate,
    evaluate_promotion_gate_for_run,
    format_report,
    promotion_summary_dict,
)
from scripts.lib.neural_ode.train_runner import model_name_for_region
from scripts.lib.neural_ode.versions import FROZEN_RESEARCH_VERSIONS

logger = logging.getLogger(__name__)


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def fetch_model_run(
    client: Client,
    *,
    model_run_id: str | None = None,
    model_name: str | None = None,
    version: str | None = None,
) -> dict[str, Any] | None:
    if model_run_id:
        response = (
            client.table("model_runs")
            .select("*")
            .eq("id", model_run_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None

    if model_name and version:
        response = (
            client.table("model_runs")
            .select("*")
            .eq("model_name", model_name)
            .eq("version", version)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None

    return None


def baseline_metrics_by_name(runs: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    wanted = {MODEL_NAMES["persistence"], MODEL_NAMES["ensemble"]}
    return {
        r["model_name"]: r
        for r in runs
        if r.get("model_name") in wanted and r.get("status") == "production"
    }


def region_scoped_baseline_metrics(
    client: Client,
    *,
    entity_type: str,
    entity_id: str,
    origin_weeks: frozenset[str] | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Persistence and ensemble metrics on the same region and evaluation slice
    as the Neural ODE candidate (holdout origins when provided).
    """
    run_ids = fetch_model_run_ids(client)
    out: dict[str, dict[str, Any]] = {}
    for key, model_name in (
        ("persistence", MODEL_NAMES["persistence"]),
        ("ensemble", MODEL_NAMES["ensemble"]),
    ):
        run_id = run_ids.get(model_name)
        if not run_id:
            continue
        metrics = compute_model_run_region_metrics(
            client,
            run_id,
            entity_type,
            entity_id,
            origin_weeks=origin_weeks,
        )
        if metrics:
            out[model_name] = {"metrics": metrics}
    return out


def archive_other_production(
    client: Client,
    *,
    model_name: str,
    keep_id: str,
) -> int:
    """Archive other production rows with the same model_name."""
    response = (
        client.table("model_runs")
        .update({"status": "archived"})
        .eq("model_name", model_name)
        .eq("status", "production")
        .neq("id", keep_id)
        .execute()
    )
    return len(response.data or [])


def promote_model_run(
    client: Client,
    model_run: dict[str, Any],
    *,
    force: bool = False,
    check_only: bool = False,
) -> tuple[int, str]:
    """
    Run promotion gate and optionally set status=production.
    Returns (exit_code, report_text).
    """
    if model_run.get("model_type") != "neural_ode":
        return 1, f"Refusing to promote non-neural_ode model: {model_run.get('model_type')}"

    version = str(model_run.get("version", ""))
    if version in FROZEN_RESEARCH_VERSIONS and not force:
        return (
            1,
            f"Refusing to promote frozen research reference v{version}. "
            "Production dashboards stay ensemble-first; see docs/PHASE7.md.",
        )

    status = model_run.get("status")
    if status == "production" and not check_only:
        return 0, f"Already production: {model_run.get('model_name')} v{model_run.get('version')}"

    if status not in ("candidate", "production", "archived"):
        return 1, f"Cannot promote from status={status}"

    entity = parse_entity_from_neural_model_name(str(model_run.get("model_name", "")))
    if entity:
        entity_type, entity_id = entity
        origin_weeks = holdout_origin_weeks_for_region(client, entity_type, entity_id)
        candidate_metrics = compute_model_run_region_metrics(
            client,
            str(model_run["id"]),
            entity_type,
            entity_id,
            origin_weeks=origin_weeks,
            model_run_row=model_run,
        )
        if not candidate_metrics:
            candidate_metrics = model_run.get("metrics") or {}
        baselines = region_scoped_baseline_metrics(
            client,
            entity_type=entity_type,
            entity_id=entity_id,
            origin_weeks=origin_weeks,
        )
        if len(baselines) < 2:
            return (
                1,
                "Missing region-scoped baseline metrics (persistence_v1 and ensemble_v1). "
                "Run baseline infer + evaluate_forecasts for this region.",
            )
        persistence = baselines.get(MODEL_NAMES["persistence"], {}).get("metrics") or {}
        ensemble = baselines.get(MODEL_NAMES["ensemble"], {}).get("metrics") or {}
        report = evaluate_promotion_gate(
            candidate_metrics,
            persistence_metrics=persistence,
            ensemble_metrics=ensemble,
            model_name=str(model_run.get("model_name", "")),
            version=str(model_run.get("version", "")),
        )
        for check in check_reproducibility_metadata(model_run):
            report.add(check.name, check.passed, check.detail)
        merge_model_run_metrics(
            client,
            str(model_run["id"]),
            {"promotion": promotion_summary_dict(report)},
        )
    else:
        all_runs = fetch_model_runs_with_metrics(client)
        baselines = baseline_metrics_by_name(all_runs)
        if len(baselines) < 2:
            return 1, "Missing production baseline metrics (persistence_v1 and ensemble_v1)"
        report = evaluate_promotion_gate_for_run(model_run, baselines)
    text = format_report(report)

    if check_only:
        return (0 if report.passed else 1), text

    if not report.passed and not force:
        return 1, text + "\n\nPromotion blocked. Fix metrics or pass --force to override."

    if not report.passed and force:
        text += "\n\nWARNING: Promoting with --force despite failed gate checks."

    run_id = str(model_run["id"])
    model_name = str(model_run["model_name"])

    archived = archive_other_production(client, model_name=model_name, keep_id=run_id)
    if archived:
        logger.info("Archived %d previous production run(s) for %s", archived, model_name)

    client.table("model_runs").update({"status": "production"}).eq("id", run_id).execute()
    text += f"\n\nPromoted {model_name} v{model_run.get('version')} to production."
    logger.info("Promoted %s to production (id=%s)", model_name, run_id)
    return 0, text


def promote_neural_ode(
    config: IngestionConfig | None = None,
    *,
    model_run_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    version: str | None = None,
    check_only: bool = False,
    force: bool = False,
    all_candidates: bool = False,
) -> int:
    _setup_logging()
    cfg = config or load_config()
    client = create_client_from_config(cfg)

    if all_candidates:
        response = (
            client.table("model_runs")
            .select("*")
            .eq("model_type", "neural_ode")
            .eq("status", "candidate")
            .execute()
        )
        candidates = response.data or []
        if not candidates:
            logger.info("No neural_ode candidates to check")
            return 0
        exit_code = 0
        for row in candidates:
            code, text = promote_model_run(
                client, row, force=force, check_only=check_only
            )
            print(text)
            print()
            if code != 0:
                exit_code = code
        return exit_code

    model_name = None
    if entity_type and entity_id:
        model_name = model_name_for_region(entity_type, entity_id)

    model_run = fetch_model_run(
        client,
        model_run_id=model_run_id,
        model_name=model_name,
        version=version,
    )
    if not model_run:
        logger.error("Model run not found")
        return 1

    code, text = promote_model_run(
        client, model_run, force=force, check_only=check_only
    )
    print(text)
    return code


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="Check promotion gate and promote Neural ODE candidate to production"
    )
    parser.add_argument("--model-run-id", help="UUID of candidate model_runs row")
    parser.add_argument("--entity-type", choices=["state", "county"])
    parser.add_argument("--entity-id", help="IL or 17031")
    parser.add_argument("--version", help="Model version, e.g. 1.0.0")
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Evaluate gate without changing status",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Promote even when gate checks fail (not recommended)",
    )
    parser.add_argument(
        "--all-candidates",
        action="store_true",
        help="Check or promote every neural_ode candidate",
    )
    args = parser.parse_args(argv)

    if (args.entity_type is None) ^ (args.entity_id is None):
        parser.error("--entity-type and --entity-id must be used together")

    if not args.model_run_id and not args.all_candidates and not (
        args.entity_type and args.entity_id and args.version
    ):
        parser.error(
            "Provide --model-run-id, (--entity-type, --entity-id, --version), or --all-candidates"
        )

    return promote_neural_ode(
        model_run_id=args.model_run_id,
        entity_type=args.entity_type,
        entity_id=args.entity_id,
        version=args.version,
        check_only=args.check_only,
        force=args.force,
        all_candidates=args.all_candidates,
    )
