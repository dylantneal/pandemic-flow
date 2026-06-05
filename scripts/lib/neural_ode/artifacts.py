"""Save and load Neural ODE checkpoints; upload to Supabase Storage."""

from __future__ import annotations

import json
import logging
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

import torch
from supabase import Client

from scripts.lib.neural_ode.covariates import (
    CovariateStats,
    covariate_stats_from_dict,
    covariate_stats_to_dict,
)
from scripts.lib.neural_ode.model import NeuralODE, NeuralOdeConfig

logger = logging.getLogger(__name__)

MODEL_ARTIFACTS_BUCKET = "model-artifacts"


def region_storage_prefix(entity_type: str, entity_id: str, version: str) -> str:
    """e.g. neural_ode/state_IL/v1.0.0"""
    folder = f"{entity_type}_{entity_id}"
    return f"neural_ode/{folder}/v{version}"


def checkpoint_storage_path(entity_type: str, entity_id: str, version: str) -> str:
    return f"{region_storage_prefix(entity_type, entity_id, version)}/checkpoint.pt"


def save_checkpoint_bundle(
    *,
    model: NeuralODE,
    mean: float,
    std: float,
    entity_type: str,
    entity_id: str,
    version: str,
    out_dir: Path,
    extra: dict[str, Any] | None = None,
    covariate_stats: CovariateStats | None = None,
) -> Path:
    """Write checkpoint.pt, config.json, and training_curve.json to out_dir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = out_dir / "checkpoint.pt"
    bundle: dict[str, Any] = {
        "state_dict": model.state_dict(),
        "config": asdict(model.config),
        "mean": mean,
        "std": std,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "version": version,
    }
    if covariate_stats is not None:
        bundle["covariate_stats"] = covariate_stats_to_dict(covariate_stats)
    if extra:
        bundle["extra"] = extra
    torch.save(bundle, ckpt_path)

    config_path = out_dir / "config.json"
    config_path.write_text(
        json.dumps(
            {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "version": version,
                "model_config": asdict(model.config),
                "mean": mean,
                "std": std,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return ckpt_path


def write_training_curve(out_dir: Path, curve: list[dict[str, float]]) -> Path:
    path = out_dir / "training_curve.json"
    path.write_text(json.dumps(curve, indent=2), encoding="utf-8")
    return path


def load_checkpoint(
    path: Path,
) -> tuple[NeuralODE, float, float, dict[str, Any], CovariateStats | None]:
    """Load model and standardization from a local checkpoint.pt."""
    bundle = torch.load(path, map_location="cpu", weights_only=False)
    config = NeuralOdeConfig(**bundle["config"])
    model = NeuralODE(config)
    model.load_state_dict(bundle["state_dict"])
    model.eval()
    cov: CovariateStats | None = None
    if bundle.get("covariate_stats"):
        cov = covariate_stats_from_dict(bundle["covariate_stats"])
    return model, float(bundle["mean"]), float(bundle["std"]), bundle, cov


def upload_artifact_dir(
    client: Client,
    local_dir: Path,
    storage_prefix: str,
) -> str:
    """
    Upload checkpoint.pt and sidecar JSON files under storage_prefix.
    Returns artifact_path for model_runs (checkpoint.pt path).
    """
    uploaded_checkpoint: str | None = None
    for filename in ("checkpoint.pt", "config.json", "training_curve.json"):
        local_path = local_dir / filename
        if not local_path.exists():
            continue
        storage_path = f"{storage_prefix}/{filename}"
        data = local_path.read_bytes()
        content_type = (
            "application/json" if filename.endswith(".json") else "application/octet-stream"
        )
        logger.info(
            "Uploading %s to %s/%s (%d bytes)",
            filename,
            MODEL_ARTIFACTS_BUCKET,
            storage_path,
            len(data),
        )
        client.storage.from_(MODEL_ARTIFACTS_BUCKET).upload(
            path=storage_path,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        if filename == "checkpoint.pt":
            uploaded_checkpoint = storage_path

    if not uploaded_checkpoint:
        raise RuntimeError("checkpoint.pt was not uploaded")
    return uploaded_checkpoint


def download_checkpoint(
    client: Client,
    artifact_path: str,
    dest: Path | None = None,
) -> Path:
    """Download checkpoint.pt from Storage to a local path."""
    dest = dest or Path(tempfile.mkdtemp(prefix="neural_ode_ckpt_")) / "checkpoint.pt"
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = client.storage.from_(MODEL_ARTIFACTS_BUCKET).download(artifact_path)
    dest.write_bytes(data)
    return dest
