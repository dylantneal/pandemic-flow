#!/usr/bin/env python3
"""Train → infer backfill → evaluate → promotion check (gate-first optimization loop)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.lib.neural_ode.versions import (
    DEFAULT_GATE_LOOP_PROFILE,
    DEFAULT_GATE_LOOP_VERSION,
    VERSION_TO_PROFILE,
)


def _run(cmd: list[str]) -> int:
    print("\n>>>", " ".join(cmd), flush=True)
    return subprocess.call(cmd, cwd=REPO_ROOT)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Neural ODE gate-first optimization loop")
    parser.add_argument("--version", default=DEFAULT_GATE_LOOP_VERSION)
    parser.add_argument(
        "--profile",
        default=None,
        help="Training profile (default: mapped from --version)",
    )
    parser.add_argument("--entity-type", choices=["state", "county"])
    parser.add_argument("--entity-id")
    parser.add_argument("--skip-train", action="store_true")
    parser.add_argument("--with-covariates", action="store_true")
    parser.add_argument("--no-pooled", action="store_true")
    args = parser.parse_args(argv)
    profile = args.profile or VERSION_TO_PROFILE.get(
        args.version, DEFAULT_GATE_LOOP_PROFILE
    )

    py = sys.executable
    train_cmd = [
        py,
        "scripts/train_neural_ode.py",
        "--version",
        args.version,
        "--profile",
        profile,
    ]
    if args.with_covariates:
        train_cmd.append("--with-covariates")
    if args.no_pooled:
        train_cmd.append("--no-pooled")
    if args.entity_type and args.entity_id:
        train_cmd.extend(["--entity-type", args.entity_type, "--entity-id", args.entity_id])

    if not args.skip_train:
        code = _run(train_cmd)
        if code != 0:
            return code

    infer_cmd = [
        py,
        "scripts/infer_neural_ode.py",
        "--backfill-weeks",
        "60",
        "--version",
        args.version,
    ]
    eval_cmd = [py, "scripts/evaluate_forecasts.py", "--neural-ode-version", args.version]
    bound_cmd = [py, "scripts/check_neural_ode_bounds.py", "--version", args.version]
    if args.entity_type and args.entity_id:
        bound_cmd.extend(["--entity-type", args.entity_type, "--entity-id", args.entity_id])

    for step in (infer_cmd, eval_cmd):
        code = _run(step)
        if code != 0:
            return code

    print(
        "\n=== Re-infer with recalibrated residual_sigma + re-evaluate intervals ===",
        flush=True,
    )
    for step in (infer_cmd, eval_cmd):
        code = _run(step)
        if code != 0:
            return code

    code = _run(bound_cmd)
    if code != 0:
        return code

    check_cmd = [py, "scripts/promote_model.py", "--check-only", "--version", args.version]
    if args.entity_type and args.entity_id:
        check_cmd.extend(["--entity-type", args.entity_type, "--entity-id", args.entity_id])
    else:
        for et, eid in (("state", "IL"), ("county", "17031")):
            code = _run(
                check_cmd
                + ["--entity-type", et, "--entity-id", eid]
            )
            if code != 0:
                print(f"Promotion check failed for {et}/{eid}", file=sys.stderr)
        return 0

    return _run(check_cmd)


if __name__ == "__main__":
    raise SystemExit(main())
