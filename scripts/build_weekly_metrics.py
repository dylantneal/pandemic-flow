#!/usr/bin/env python3
"""Build weekly site and region metrics from clean observations."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.lib.config import load_config  # noqa: E402
from scripts.lib.weekly_metrics_build import build_weekly_metrics  # noqa: E402


def main() -> int:
    return build_weekly_metrics(load_config())


if __name__ == "__main__":
    raise SystemExit(main())
