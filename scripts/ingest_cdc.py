#!/usr/bin/env python3
"""
Ingest CDC NWSS SARS-CoV-2 wastewater CSV into Supabase.

Usage:
  python scripts/ingest_cdc.py
  python scripts/ingest_cdc.py --local-file CDC_Wastewater_Data_for_SARS-CoV-2.csv

Requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
Optional: CDC_WASTEWATER_CSV_URL (defaults to CDC Socrata CSV download).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running as `python scripts/ingest_cdc.py` from repo root.
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.lib.config import load_config  # noqa: E402
from scripts.lib.ingestion import ingest_cdc  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest CDC wastewater CSV into Supabase")
    parser.add_argument(
        "--local-file",
        type=Path,
        help="Use a local CSV instead of downloading (for dev/testing)",
    )
    args = parser.parse_args()

    config = load_config()
    local = args.local_file.resolve() if args.local_file else None
    if local and not local.exists():
        print(f"Local file not found: {local}", file=sys.stderr)
        return 1

    return ingest_cdc(config, csv_path=local)


if __name__ == "__main__":
    raise SystemExit(main())
