#!/usr/bin/env python3
"""Transform Illinois raw CDC rows into clean_observations."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.lib.clean_transform import transform_clean_observations  # noqa: E402
from scripts.lib.config import load_config  # noqa: E402


def main() -> int:
    return transform_clean_observations(load_config())


if __name__ == "__main__":
    raise SystemExit(main())
