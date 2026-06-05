#!/usr/bin/env python3
"""Check hard-bounded Neural ODE h1 correction invariants."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.lib.config import load_config  # noqa: E402
from scripts.lib.forecast_db import create_client_from_config  # noqa: E402
from scripts.lib.neural_ode.bounds_diagnostic import (  # noqa: E402
    check_h1_correction_bounds,
    format_h1_bound_report,
)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="Assert h1 Neural ODE predictions stay within correction caps"
    )
    parser.add_argument("--version", required=True)
    parser.add_argument("--entity-type", choices=["state", "county"])
    parser.add_argument("--entity-id")
    parser.add_argument("--tolerance", type=float, default=0.0001)
    args = parser.parse_args(argv)

    if (args.entity_type is None) ^ (args.entity_id is None):
        parser.error("--entity-type and --entity-id must be used together")

    client = create_client_from_config(load_config())
    results = check_h1_correction_bounds(
        client,
        version=args.version,
        entity_type=args.entity_type,
        entity_id=args.entity_id,
        tolerance=args.tolerance,
    )
    print(format_h1_bound_report(results))
    return 0 if results and all(result.passed for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
