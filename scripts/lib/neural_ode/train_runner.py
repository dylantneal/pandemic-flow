"""Orchestrate Neural ODE training, artifact upload, and model_runs registration."""

from __future__ import annotations

import logging
import sys
import tempfile
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any

from supabase import Client

from scripts.lib.config import IngestionConfig, load_config
from scripts.lib.forecast_db import REGIONS, create_client_from_config, fetch_region_history
from scripts.lib.supabase_client import upsert_batch
from scripts.lib.neural_ode.artifacts import (
    region_storage_prefix,
    save_checkpoint_bundle,
    upload_artifact_dir,
    write_training_curve,
)
from scripts.lib.neural_ode.covariates import covariate_stats_to_dict
from scripts.lib.neural_ode.model import NeuralOdeConfig
from scripts.lib.neural_ode.reproducibility import get_git_commit, hash_training_slice, seed_everything
from scripts.lib.neural_ode.dataset import compute_series_split
from scripts.lib.neural_ode.training import (
    DEFAULT_HORIZON_WEIGHTS,
    train_pooled_regions,
    train_one_region,
    train_one_region_multi_seed,
)

logger = logging.getLogger(__name__)

# Gate-oriented optimization profiles (ablation matrix A→D in run_neural_ode_ablation.py)
OPTIMIZATION_PROFILES: dict[str, dict[str, Any]] = {
    "reliability_correction_v1": {
        "description": "Recommended: constrained baseline-correction per region (state_dim=1, tight caps)",
        "reliability_mode": True,
        "log_target": False,
        "trend_loss_weight": 0.75,
        "trend_loss_horizons": 1,
        "correction_cap_weight": 0.35,
        "correction_cap_horizons": 4,
        "correction_cap_h1": 0.25,
        "correction_cap_h2": 0.35,
        "correction_cap_h3": 0.50,
        "correction_cap_h4": 0.65,
        "hard_correction_bound": True,
        "val_gate_trend_weight": 1.0,
        "region_balance_weight": 0.0,
        "turn_point_weight": 1.5,
    },
    "shrinkage_correction_v1": {
        "description": "Reliability + per-horizon shrinkage gates (abstain unless corrections help)",
        "reliability_mode": True,
        "log_target": False,
        "trend_loss_weight": 0.75,
        "trend_loss_horizons": 1,
        "correction_cap_weight": 0.35,
        "correction_cap_horizons": 4,
        "correction_cap_h1": 0.25,
        "correction_cap_h2": 0.35,
        "correction_cap_h3": 0.50,
        "correction_cap_h4": 0.65,
        "hard_correction_bound": True,
        "correction_shrinkage_enabled": True,
        "correction_gate_penalty_weight": 0.12,
        "correction_gate_h1_penalty_weight": 2.5,
        "val_gate_trend_weight": 1.0,
        "region_balance_weight": 0.0,
        "turn_point_weight": 1.5,
    },
    "shrinkage_correction_v2": {
        "description": "Conservative shrinkage: near-abstention h2/h4 unless validation proves value",
        "reliability_mode": True,
        "log_target": False,
        "trend_loss_weight": 0.75,
        "trend_loss_horizons": 1,
        "correction_cap_weight": 0.35,
        "correction_cap_horizons": 4,
        "correction_cap_h1": 0.25,
        "correction_cap_h2": 0.35,
        "correction_cap_h3": 0.50,
        "correction_cap_h4": 0.65,
        "hard_correction_bound": True,
        "correction_shrinkage_enabled": True,
        "correction_gate_init_logits": (-3.0, -2.0, -1.0, -0.5),
        "correction_gate_penalty_weight": 0.22,
        "correction_gate_h1_penalty_weight": 2.5,
        "correction_gate_medium_horizon_penalty_weight": 2.0,
        "val_gate_excess_weight": 2.0,
        "val_gate_open_gate_weight": 0.35,
        "val_gate_trend_weight": 1.0,
        "region_balance_weight": 0.0,
        "turn_point_weight": 1.5,
    },
    "shrinkage_correction_h4_abstain": {
        "description": "1.7.5 parity on h1–h3; stronger h4 gate abstention only",
        "reliability_mode": True,
        "log_target": False,
        "trend_loss_weight": 0.75,
        "trend_loss_horizons": 1,
        "correction_cap_weight": 0.35,
        "correction_cap_horizons": 4,
        "correction_cap_h1": 0.25,
        "correction_cap_h2": 0.35,
        "correction_cap_h3": 0.50,
        "correction_cap_h4": 0.65,
        "hard_correction_bound": True,
        "correction_shrinkage_enabled": True,
        "correction_gate_init_logits": (-3.0, -2.0, -1.0, -2.5),
        "correction_gate_penalty_weight": 0.22,
        "correction_gate_h1_penalty_weight": 2.5,
        "correction_gate_medium_horizon_penalty_weight": 2.0,
        "correction_gate_h4_penalty_weight": 4.5,
        "val_gate_excess_weight": 2.0,
        "val_gate_open_gate_weight": 0.35,
        "val_gate_trend_weight": 1.0,
        "region_balance_weight": 0.0,
        "turn_point_weight": 1.5,
    },
    "gate_corrected_only": {
        "description": "Phase 1 gate-corrected eval only (v1.6-class training)",
        "trend_loss_weight": 1.25,
        "trend_loss_horizons": 1,
        "correction_cap_weight": 0.2,
        "correction_cap_horizons": 2,
        "correction_cap_h1": 0.7,
        "correction_cap_h2": 0.7,
        "val_gate_trend_weight": 1.0,
        "region_balance_weight": 0.0,
        "turn_point_weight": 1.0,
    },
    "gate_first_v8_region_balance": {
        "description": "A + region-balanced pooled loss",
        "trend_loss_weight": 1.25,
        "trend_loss_horizons": 1,
        "correction_cap_weight": 0.2,
        "correction_cap_horizons": 2,
        "correction_cap_h1": 0.7,
        "correction_cap_h2": 0.7,
        "val_gate_trend_weight": 1.0,
        "region_balance_weight": 1.0,
        "turn_point_weight": 1.0,
    },
    "gate_first_v8_turnpoint": {
        "description": "A + region balance + turn-point upweighting",
        "trend_loss_weight": 1.5,
        "trend_loss_horizons": 1,
        "correction_cap_weight": 0.2,
        "correction_cap_horizons": 2,
        "correction_cap_h1": 0.7,
        "correction_cap_h2": 0.7,
        "val_gate_trend_weight": 1.25,
        "region_balance_weight": 1.0,
        "turn_point_weight": 2.5,
    },
    "gate_first_v8_balanced_turnpoint_pooled": {
        "description": "Full v1.7 profile: balance + turn-point + per-horizon correction caps",
        "trend_loss_weight": 1.5,
        "trend_loss_horizons": 1,
        "correction_cap_weight": 0.25,
        "correction_cap_horizons": 4,
        "correction_cap_h1": 0.45,
        "correction_cap_h2": 0.65,
        "correction_cap_h3": 0.85,
        "correction_cap_h4": 1.0,
        "val_gate_trend_weight": 1.25,
        "region_balance_weight": 1.0,
        "turn_point_weight": 2.5,
    },
}


def node_config_from_profile(
    profile: str,
    *,
    with_covariates: bool = False,
    n_regions: int = 2,
) -> NeuralOdeConfig:
    """Build NeuralOdeConfig for a named optimization profile."""
    params = OPTIMIZATION_PROFILES.get(profile)
    if params is None:
        raise ValueError(
            f"Unknown profile {profile!r}; choose from {list(OPTIMIZATION_PROFILES)}"
        )
    base_n_cov = 4
    reliability_mode = bool(params.get("reliability_mode", False))
    return NeuralOdeConfig(
        state_dim=1 if reliability_mode else 2,
        hidden_dim=12 if reliability_mode else 16,
        depth=2,
        with_covariates=with_covariates,
        n_origin_covariates=base_n_cov + (n_regions if with_covariates else 0),
        residual_on_persistence=False,
        log_target=bool(params.get("log_target", True)),
        baseline_anchor_head=True,
        trend_loss_weight=float(params["trend_loss_weight"]),
        trend_loss_horizons=int(params["trend_loss_horizons"]),
        trend_loss_deadband=0.0,
        trend_loss_temperature=0.05,
        correction_cap_weight=float(params["correction_cap_weight"]),
        correction_cap_value=0.7,
        correction_cap_h1=float(params.get("correction_cap_h1", 0.7)),
        correction_cap_h2=float(params.get("correction_cap_h2", 0.7)),
        correction_cap_h3=float(params.get("correction_cap_h3", 0.85)),
        correction_cap_h4=float(params.get("correction_cap_h4", 1.0)),
        correction_cap_horizons=int(params["correction_cap_horizons"]),
        hard_correction_bound=bool(params.get("hard_correction_bound", False)),
        correction_shrinkage_enabled=bool(params.get("correction_shrinkage_enabled", False)),
        correction_gate_penalty_weight=float(params.get("correction_gate_penalty_weight", 0.0)),
        correction_gate_h1_penalty_weight=float(
            params.get("correction_gate_h1_penalty_weight", 2.0)
        ),
        correction_gate_medium_horizon_penalty_weight=float(
            params.get("correction_gate_medium_horizon_penalty_weight", 1.75)
        ),
        correction_gate_h4_penalty_weight=(
            float(params["correction_gate_h4_penalty_weight"])
            if params.get("correction_gate_h4_penalty_weight") is not None
            else None
        ),
        correction_gate_init_logits=tuple(params["correction_gate_init_logits"])
        if params.get("correction_gate_init_logits")
        else None,
        val_gate_excess_weight=float(params.get("val_gate_excess_weight", 2.0)),
        val_gate_open_gate_weight=float(params.get("val_gate_open_gate_weight", 0.0)),
        val_gate_trend_weight=float(params["val_gate_trend_weight"]),
        region_balance_weight=float(params["region_balance_weight"]),
        turn_point_weight=float(params["turn_point_weight"]),
        turn_point_margin=0.10,
    )


def model_name_for_region(entity_type: str, entity_id: str) -> str:
    return f"neural_ode_{entity_id}"


def region_key(entity_type: str, entity_id: str) -> str:
    return f"{entity_type}:{entity_id}"


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def register_model_run(
    client: Client,
    *,
    entity_type: str,
    entity_id: str,
    version: str,
    artifact_path: str,
    hyperparameters: dict[str, Any],
    holdout_metrics: dict[str, Any],
    history_len: int,
    git_commit: str | None,
) -> str:
    """Upsert model_runs row with status=candidate. Returns model run id."""
    split = compute_series_split(history_len)
    row = {
        "model_name": model_name_for_region(entity_type, entity_id),
        "model_type": "neural_ode",
        "version": version,
        "status": "candidate",
        "artifact_path": artifact_path,
        "git_commit": git_commit,
        "hyperparameters": hyperparameters,
        "metrics": holdout_metrics,
    }
    upsert_batch(client, "model_runs", [row], on_conflict="model_name,version")
    lookup = (
        client.table("model_runs")
        .select("id")
        .eq("model_name", row["model_name"])
        .eq("version", version)
        .single()
        .execute()
    )
    return str(lookup.data["id"])


def train_region(
    client: Client,
    *,
    entity_type: str,
    entity_id: str,
    region_name: str,
    version: str,
    seed: int,
    seeds: list[int] | None,
    max_epochs: int,
    patience: int,
    node_config: NeuralOdeConfig,
    dry_run: bool,
    git_commit: str | None,
    with_covariates: bool,
    profile_name: str = "reliability_correction_v1",
) -> dict[str, Any]:
    history = fetch_region_history(
        client, entity_type, entity_id, with_covariates=with_covariates
    )
    if not history:
        raise RuntimeError(f"No history for {region_name}")

    config = replace(
        node_config,
        with_covariates=with_covariates,
        n_origin_covariates=node_config.n_origin_covariates,
    )

    split = compute_series_split(len(history))
    data_hash = hash_training_slice(history, split.train_indices)

    seed_list = seeds if seeds and len(seeds) > 1 else [seed]
    if len(seed_list) > 1:
        result = train_one_region_multi_seed(
            history,
            seed_list,
            config=config,
            max_epochs=max_epochs,
            patience=patience,
        )
    else:
        seed_everything(seed_list[0])
        result = train_one_region(
            history,
            config=config,
            max_epochs=max_epochs,
            patience=patience,
            seed=seed_list[0],
        )

    if result.model is None:
        raise RuntimeError("Training did not produce a model")

    hyperparameters: dict[str, Any] = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "seed": result.seed if result.seed is not None else seed_list[0],
        "seeds_evaluated": seed_list,
        "data_hash": data_hash,
        "mean": round(result.mean, 6),
        "std": round(result.std, 6),
        "model_config": asdict(config),
        "max_epochs": max_epochs,
        "patience": patience,
        "epochs_run": result.epochs_run,
        "best_val_loss": round(result.best_val_loss, 6),
        "best_val_gate_score": round(result.best_val_gate_score, 6),
        "horizon_weights": DEFAULT_HORIZON_WEIGHTS,
        "with_covariates": with_covariates,
        "optimization_profile": profile_name,
        "val_metrics": result.val_metrics,
        "trend_diagnostics_1w": result.trend_diagnostics,
    }
    if result.covariate_stats is not None:
        hyperparameters["covariate_stats"] = covariate_stats_to_dict(result.covariate_stats)

    summary: dict[str, Any] = {
        "region": region_name,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "epochs_run": result.epochs_run,
        "best_val_loss": result.best_val_loss,
        "best_val_gate_score": result.best_val_gate_score,
        "holdout_metrics": result.holdout_metrics,
    }

    if dry_run:
        logger.info("Dry run: skipping artifact upload and model_runs write for %s", region_name)
        return summary

    with tempfile.TemporaryDirectory(prefix="neural_ode_train_") as tmp:
        out_dir = Path(tmp)
        save_checkpoint_bundle(
            model=result.model,
            mean=result.mean,
            std=result.std,
            entity_type=entity_type,
            entity_id=entity_id,
            version=version,
            out_dir=out_dir,
            extra={"holdout_metrics": result.holdout_metrics},
            covariate_stats=result.covariate_stats,
        )
        write_training_curve(out_dir, result.training_curve)

        prefix = region_storage_prefix(entity_type, entity_id, version)
        artifact_path = upload_artifact_dir(client, out_dir, prefix)

    run_id = register_model_run(
        client,
        entity_type=entity_type,
        entity_id=entity_id,
        version=version,
        artifact_path=artifact_path,
        hyperparameters=hyperparameters,
        holdout_metrics=result.holdout_metrics,
        history_len=len(history),
        git_commit=git_commit,
    )
    summary["model_run_id"] = run_id
    summary["artifact_path"] = artifact_path
    logger.info(
        "Registered %s v%s as candidate (id=%s, artifact=%s, val_gate=%.4f)",
        model_name_for_region(entity_type, entity_id),
        version,
        run_id,
        artifact_path,
        result.best_val_gate_score,
    )
    return summary


def train_pooled_targets(
    client: Client,
    *,
    targets: list[tuple[str, str, str]],
    version: str,
    seed: int,
    seeds: list[int] | None,
    max_epochs: int,
    patience: int,
    node_config: NeuralOdeConfig,
    dry_run: bool,
    git_commit: str | None,
    with_covariates: bool,
    profile_name: str = "gate_first_v8_balanced_turnpoint_pooled",
) -> list[dict[str, Any]]:
    """Train one shared model across targets; register per-region candidate runs."""
    histories_by_region: dict[str, list[Any]] = {}
    target_meta: dict[str, tuple[str, str, str]] = {}
    data_hash_by_region: dict[str, str] = {}

    for entity_type, entity_id, region_name in targets:
        key = region_key(entity_type, entity_id)
        history = fetch_region_history(
            client,
            entity_type,
            entity_id,
            with_covariates=with_covariates,
        )
        if not history:
            raise RuntimeError(f"No history for {region_name}")
        histories_by_region[key] = history
        target_meta[key] = (entity_type, entity_id, region_name)
        split = compute_series_split(len(history))
        data_hash_by_region[key] = hash_training_slice(history, split.train_indices)

    pooled_config = replace(node_config, with_covariates=True)

    seed_list = seeds if seeds and len(seeds) > 1 else [seed]
    pooled_result = None
    for s in seed_list:
        seed_everything(s)
        candidate = train_pooled_regions(
            histories_by_region,
            config=pooled_config,
            max_epochs=max_epochs,
            patience=patience,
            seed=s,
        )
        if (
            pooled_result is None
            or candidate.best_val_gate_score < pooled_result.best_val_gate_score
        ):
            pooled_result = candidate

    if pooled_result is None or pooled_result.model is None:
        raise RuntimeError("Pooled training did not produce a model")

    summaries: list[dict[str, Any]] = []
    for key, history in histories_by_region.items():
        entity_type, entity_id, region_name = target_meta[key]
        holdout_metrics = pooled_result.holdout_metrics_by_region[key]

        hyperparameters: dict[str, Any] = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "seed": pooled_result.seed if pooled_result.seed is not None else seed_list[0],
            "seeds_evaluated": seed_list,
            "data_hash": data_hash_by_region[key],
            "mean": round(pooled_result.mean, 6),
            "std": round(pooled_result.std, 6),
            "model_config": asdict(pooled_config),
            "max_epochs": max_epochs,
            "patience": patience,
            "epochs_run": pooled_result.epochs_run,
            "best_val_loss": round(pooled_result.best_val_loss, 6),
            "best_val_gate_score": round(pooled_result.best_val_gate_score, 6),
            "horizon_weights": DEFAULT_HORIZON_WEIGHTS,
            "with_covariates": with_covariates,
            "optimization_profile": profile_name,
            "pooled_training": True,
            "pooled_regions": list(histories_by_region.keys()),
            "region_key": key,
            "val_metrics": pooled_result.val_metrics_by_region.get(key, {}),
            "trend_diagnostics_1w": pooled_result.trend_diagnostics_by_region.get(key, {}),
        }
        if pooled_result.covariate_stats is not None:
            hyperparameters["covariate_stats"] = covariate_stats_to_dict(
                pooled_result.covariate_stats
            )

        summary: dict[str, Any] = {
            "region": region_name,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "epochs_run": pooled_result.epochs_run,
            "best_val_loss": pooled_result.best_val_loss,
            "best_val_gate_score": pooled_result.best_val_gate_score,
            "holdout_metrics": holdout_metrics,
            "pooled_training": True,
        }

        if dry_run:
            logger.info(
                "Dry run: skipping artifact upload and model_runs write for pooled target %s",
                region_name,
            )
            summaries.append(summary)
            continue

        with tempfile.TemporaryDirectory(prefix="neural_ode_train_pooled_") as tmp:
            out_dir = Path(tmp)
            save_checkpoint_bundle(
                model=pooled_result.model,
                mean=pooled_result.mean,
                std=pooled_result.std,
                entity_type=entity_type,
                entity_id=entity_id,
                version=version,
                out_dir=out_dir,
                extra={
                    "holdout_metrics": holdout_metrics,
                    "pooled_training": True,
                },
                covariate_stats=pooled_result.covariate_stats,
            )
            write_training_curve(out_dir, pooled_result.training_curve)
            prefix = region_storage_prefix(entity_type, entity_id, version)
            artifact_path = upload_artifact_dir(client, out_dir, prefix)

        run_id = register_model_run(
            client,
            entity_type=entity_type,
            entity_id=entity_id,
            version=version,
            artifact_path=artifact_path,
            hyperparameters=hyperparameters,
            holdout_metrics=holdout_metrics,
            history_len=len(history),
            git_commit=git_commit,
        )
        summary["model_run_id"] = run_id
        summary["artifact_path"] = artifact_path
        summaries.append(summary)
        logger.info(
            "Registered pooled %s v%s as candidate (id=%s, artifact=%s, val_gate=%.4f)",
            model_name_for_region(entity_type, entity_id),
            version,
            run_id,
            artifact_path,
            pooled_result.best_val_gate_score,
        )

    return summaries


def train_neural_ode(
    config: IngestionConfig | None = None,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    version: str = "1.7.0",
    seed: int = 42,
    seeds: list[int] | None = None,
    max_epochs: int = 800,
    patience: int = 50,
    dry_run: bool = False,
    with_covariates: bool = False,
    pooled: bool = True,
    profile: str = "reliability_correction_v1",
) -> int:
    _setup_logging()
    cfg = config or load_config()
    client = create_client_from_config(cfg)
    git_commit = cfg.git_commit or get_git_commit()
    reliability_profile = profile in (
        "reliability_correction_v1",
        "shrinkage_correction_v1",
        "shrinkage_correction_v2",
        "shrinkage_correction_h4_abstain",
    )
    if reliability_profile and pooled and not (entity_type and entity_id):
        pooled = False
        logger.info(
            "Reliability profile uses per-region training (pooled disabled by default)"
        )
    n_targets = 2 if pooled and not (entity_type and entity_id) else 1
    node_config = node_config_from_profile(
        profile,
        with_covariates=with_covariates or pooled,
        n_regions=n_targets,
    )

    targets: list[tuple[str, str, str]] = []
    if entity_type and entity_id:
        name = next(
            (n for et, eid, n in REGIONS if et == entity_type and eid == entity_id),
            f"{entity_type}/{entity_id}",
        )
        targets = [(entity_type, entity_id, name)]
    else:
        targets = list(REGIONS)

    if pooled and not (entity_type and entity_id):
        logger.info(
            "Training pooled Neural ODE across %d regions (covariates=%s, seeds=%s, profile=%s)",
            len(targets),
            with_covariates,
            seeds or [seed],
            profile,
        )
        summaries = train_pooled_targets(
            client,
            targets=targets,
            version=version,
            seed=seed,
            seeds=seeds,
            max_epochs=max_epochs,
            patience=patience,
            node_config=node_config,
            dry_run=dry_run,
            git_commit=git_commit,
            with_covariates=with_covariates or True,
            profile_name=profile,
        )
        for summary in summaries:
            logger.info("Holdout metrics (%s): %s", summary["region"], summary["holdout_metrics"])
        return 0

    for et, eid, name in targets:
        logger.info(
            "Training Neural ODE for %s (covariates=%s, seeds=%s, profile=%s)",
            name,
            with_covariates,
            seeds or [seed],
            profile,
        )
        summary = train_region(
            client,
            entity_type=et,
            entity_id=eid,
            region_name=name,
            version=version,
            seed=seed,
            seeds=seeds,
            max_epochs=max_epochs,
            patience=patience,
            node_config=node_config,
            dry_run=dry_run,
            git_commit=git_commit,
            with_covariates=with_covariates,
            profile_name=profile,
        )
        logger.info("Holdout metrics: %s", summary.get("holdout_metrics"))

    return 0


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Train Neural ODE for IL / Cook County")
    parser.add_argument("--entity-type", choices=["state", "county"], help="Train one region")
    parser.add_argument("--entity-id", help="Region id (IL or 17031)")
    parser.add_argument("--version", default="1.7.0", help="Model version string")
    parser.add_argument(
        "--profile",
        default="reliability_correction_v1",
        choices=list(OPTIMIZATION_PROFILES),
        help="Optimization profile (reliability_correction_v1 recommended)",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--seeds",
        type=str,
        default="42,43,44",
        help="Comma-separated seeds for multi-seed selection (best val_gate_score wins)",
    )
    parser.add_argument("--epochs", type=int, default=800)
    parser.add_argument("--patience", type=int, default=50)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Train locally without Storage upload or model_runs write",
    )
    parser.add_argument(
        "--with-covariates",
        action="store_true",
        help="Enable weekly covariates (default: off, pooled region-conditioning always on)",
    )
    parser.add_argument(
        "--no-pooled",
        action="store_true",
        help="Disable pooled multi-region training and train each region independently",
    )
    args = parser.parse_args(argv)

    if (args.entity_type is None) ^ (args.entity_id is None):
        parser.error("--entity-type and --entity-id must be used together")

    seed_list = [int(s.strip()) for s in args.seeds.split(",") if s.strip()]
    with_cov = args.with_covariates

    return train_neural_ode(
        entity_type=args.entity_type,
        entity_id=args.entity_id,
        version=args.version,
        seed=args.seed,
        seeds=seed_list if len(seed_list) > 1 else None,
        max_epochs=args.epochs,
        patience=args.patience,
        dry_run=args.dry_run,
        with_covariates=with_cov,
        pooled=not args.no_pooled,
        profile=args.profile,
    )
