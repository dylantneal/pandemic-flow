#!/usr/bin/env python3
"""Infer Neural ODE forecasts and derivatives for production model runs."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.lib.neural_ode.infer_runner import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
