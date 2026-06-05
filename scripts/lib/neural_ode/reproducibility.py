"""Reproducibility helpers for Neural ODE training."""

from __future__ import annotations

import hashlib
import json
import os
import random
import subprocess
from typing import Sequence

import numpy as np
import torch

from scripts.lib.forecast_baselines import WeeklySeriesPoint


def seed_everything(seed: int) -> None:
    """Set seeds and enable deterministic PyTorch algorithms."""
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)


def hash_training_slice(
    history: Sequence[WeeklySeriesPoint],
    train_indices: Sequence[int],
) -> str:
    """SHA256 of canonical JSON for the training slice (for model_runs.hyperparameters)."""
    rows = [
        {
            "week_start": history[i].week_start.isoformat(),
            "value": round(history[i].value, 6),
        }
        for i in sorted(train_indices)
    ]
    payload = json.dumps(rows, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_git_commit() -> str | None:
    """Return HEAD commit hash, or None if not in a git repo."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        return result.stdout.strip() or None
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return None
