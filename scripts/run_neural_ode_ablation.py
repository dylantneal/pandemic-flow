#!/usr/bin/env python3
"""
Controlled ablation for Neural ODE gate recovery (profiles A→D).

A: gate_corrected_only
B: gate_first_v8_region_balance
C: gate_first_v8_turnpoint
D: gate_first_v8_balanced_turnpoint_pooled (v1.7 default)

Runs train → infer → evaluate → promotion check per profile with fixed seed.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

ABLATION_MATRIX = [
    ("A", "gate_corrected_only"),
    ("B", "gate_first_v8_region_balance"),
    ("C", "gate_first_v8_turnpoint"),
    ("D", "gate_first_v8_balanced_turnpoint_pooled"),
]


def _run(cmd: list[str]) -> int:
    print("\n>>>", " ".join(cmd), flush=True)
    return subprocess.call(cmd, cwd=REPO_ROOT)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Neural ODE ablation matrix")
    parser.add_argument("--base-version", default="1.7.0-ablation")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--skip-train", action="store_true")
    parser.add_argument("--only", choices=[x[0] for x in ABLATION_MATRIX])
    args = parser.parse_args(argv)

    py = sys.executable
    results: list[tuple[str, str, int]] = []

    for label, profile in ABLATION_MATRIX:
        if args.only and label != args.only:
            continue
        version = f"{args.base_version}-{label.lower()}"
        print(f"\n=== Ablation {label}: {profile} (version {version}) ===", flush=True)

        if not args.skip_train:
            code = _run(
                [
                    py,
                    "scripts/train_neural_ode.py",
                    "--version",
                    version,
                    "--profile",
                    profile,
                    "--seed",
                    str(args.seed),
                    "--seeds",
                    str(args.seed),
                ]
            )
            if code != 0:
                results.append((label, profile, code))
                continue

        for step in (
            [
                py,
                "scripts/infer_neural_ode.py",
                "--backfill-weeks",
                "60",
                "--version",
                version,
            ],
            [py, "scripts/evaluate_forecasts.py", "--neural-ode-version", version],
        ):
            code = _run(step)
            if code != 0:
                results.append((label, profile, code))
                break
        else:
            check_code = 0
            for et, eid in (("state", "IL"), ("county", "17031")):
                code = _run(
                    [
                        py,
                        "scripts/promote_model.py",
                        "--check-only",
                        "--version",
                        version,
                        "--entity-type",
                        et,
                        "--entity-id",
                        eid,
                    ]
                )
                if code != 0:
                    check_code = code
            results.append((label, profile, check_code))

    print("\n=== Ablation summary ===", flush=True)
    for label, profile, code in results:
        status = "PASS" if code == 0 else f"exit {code}"
        print(f"  {label} ({profile}): {status}")

    return 0 if all(c == 0 for _, _, c in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
