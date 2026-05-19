"""Load environment configuration for ingestion scripts."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CDC_URL = (
    "https://data.cdc.gov/api/views/j9g8-acpt/rows.csv?accessType=DOWNLOAD"
)
CDC_DATASET_SLUG = "j9g8-acpt"
STORAGE_BUCKET = "raw-cdc-wastewater-snapshots"
BATCH_SIZE = 1000


@dataclass(frozen=True)
class IngestionConfig:
    supabase_url: str
    service_role_key: str
    cdc_csv_url: str
    trigger_type: str = "manual"
    git_commit: str | None = None


def _load_env_files() -> None:
    for candidate in (
        REPO_ROOT / ".env.local",
        REPO_ROOT / ".env",
        REPO_ROOT / "apps" / "web" / ".env.local",
    ):
        if candidate.exists():
            load_dotenv(candidate, override=False)


def load_config() -> IngestionConfig:
    _load_env_files()

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get(
        "SUPABASE_URL"
    )
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    cdc_csv_url = os.environ.get("CDC_WASTEWATER_CSV_URL", DEFAULT_CDC_URL)

    missing: list[str] = []
    if not supabase_url:
        missing.append("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL")
    if not service_role_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")

    if missing:
        raise RuntimeError(
            "Missing required environment variables: " + ", ".join(missing)
        )

    return IngestionConfig(
        supabase_url=supabase_url.rstrip("/"),
        service_role_key=service_role_key,
        cdc_csv_url=cdc_csv_url,
        trigger_type=os.environ.get("INGESTION_TRIGGER_TYPE", "manual"),
        git_commit=os.environ.get("GIT_COMMIT") or os.environ.get("GITHUB_SHA"),
    )
