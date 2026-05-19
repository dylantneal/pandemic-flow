#!/usr/bin/env python3
"""Run Phase 3 cleaning: refresh sites, then transform observations."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.lib.clean_transform import transform_clean_observations  # noqa: E402
from scripts.lib.config import load_config  # noqa: E402
from scripts.lib.sites_refresh import refresh_sites  # noqa: E402


def main() -> int:
    config = load_config()
    if refresh_sites(config) != 0:
        return 1
    return transform_clean_observations(config)


if __name__ == "__main__":
    raise SystemExit(main())
