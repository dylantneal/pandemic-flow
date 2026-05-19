"""Supabase service-role client helpers for ingestion."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from supabase import Client, create_client

from scripts.lib.config import CDC_DATASET_SLUG, IngestionConfig

logger = logging.getLogger(__name__)

MAX_UPSERT_RETRIES = 5


def create_service_client(config: IngestionConfig) -> Client:
    return create_client(config.supabase_url, config.service_role_key)


def get_data_source_id(client: Client) -> str:
    response = (
        client.table("data_sources")
        .select("id")
        .eq("dataset_slug", CDC_DATASET_SLUG)
        .single()
        .execute()
    )
    if not response.data:
        raise RuntimeError(f"data_sources row not found for slug {CDC_DATASET_SLUG}")
    return response.data["id"]


def start_ingestion_run(
    client: Client,
    *,
    data_source_id: str,
    trigger_type: str,
    git_commit: str | None,
) -> str:
    payload: dict[str, Any] = {
        "data_source_id": data_source_id,
        "status": "running",
        "trigger_type": trigger_type,
        "git_commit": git_commit,
    }
    response = client.table("ingestion_runs").insert(payload).execute()
    run_id = response.data[0]["id"]
    logger.info("Started ingestion_run %s", run_id)
    return run_id


def finish_ingestion_run(
    client: Client,
    run_id: str,
    *,
    status: str,
    source_row_count: int | None = None,
    inserted_count: int | None = None,
    updated_count: int | None = None,
    skipped_count: int | None = None,
    error_message: str | None = None,
    raw_snapshot_path: str | None = None,
) -> None:
    payload: dict[str, Any] = {
        "status": status,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    if source_row_count is not None:
        payload["source_row_count"] = source_row_count
    if inserted_count is not None:
        payload["inserted_count"] = inserted_count
    if updated_count is not None:
        payload["updated_count"] = updated_count
    if skipped_count is not None:
        payload["skipped_count"] = skipped_count
    if error_message is not None:
        payload["error_message"] = error_message[:4000]
    if raw_snapshot_path is not None:
        payload["raw_snapshot_path"] = raw_snapshot_path

    client.table("ingestion_runs").update(payload).eq("id", run_id).execute()
    logger.info("Finished ingestion_run %s with status=%s", run_id, status)


def update_data_source_after_success(
    client: Client,
    data_source_id: str,
    *,
    schema_hash: str,
    latest_source_updated_at: str | None,
) -> None:
    payload: dict[str, Any] = {
        "last_checked_at": datetime.now(timezone.utc).isoformat(),
        "last_successful_ingest_at": datetime.now(timezone.utc).isoformat(),
        "schema_hash": schema_hash,
    }
    if latest_source_updated_at:
        payload["latest_source_updated_at"] = latest_source_updated_at

    client.table("data_sources").update(payload).eq("id", data_source_id).execute()


def build_snapshot_prefix() -> str:
    now = datetime.now(timezone.utc)
    return (
        f"cdc-wastewater/{now:%Y/%m/%d}/"
        f"cdc_wastewater_{now:%Y%m%dT%H%M%SZ}"
    )


def upsert_raw_batch(
    client: Client,
    rows: list[dict[str, Any]],
) -> tuple[int, int]:
    """
    Upsert a batch of raw rows with retries for transient network failures.
    Returns (inserted_estimate, updated_estimate).
    """
    if not rows:
        return 0, 0

    last_error: Exception | None = None
    for attempt in range(1, MAX_UPSERT_RETRIES + 1):
        try:
            client.table("raw_cdc_wastewater_samples").upsert(
                rows,
                on_conflict="record_id",
            ).execute()
            return len(rows), 0
        except Exception as exc:  # noqa: BLE001 — retry on any transport/API flake
            last_error = exc
            if attempt >= MAX_UPSERT_RETRIES:
                break
            delay = min(2**attempt, 30)
            logger.warning(
                "Batch upsert failed (attempt %d/%d): %s; retrying in %ds",
                attempt,
                MAX_UPSERT_RETRIES,
                exc,
                delay,
            )
            time.sleep(delay)

    assert last_error is not None
    raise last_error


def upsert_batch(
    client: Client,
    table: str,
    rows: list[dict[str, Any]],
    *,
    on_conflict: str,
) -> None:
    """Generic upsert with retries."""
    if not rows:
        return

    last_error: Exception | None = None
    for attempt in range(1, MAX_UPSERT_RETRIES + 1):
        try:
            client.table(table).upsert(rows, on_conflict=on_conflict).execute()
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt >= MAX_UPSERT_RETRIES:
                break
            delay = min(2**attempt, 30)
            logger.warning(
                "%s upsert failed (attempt %d/%d): %s; retrying in %ds",
                table,
                attempt,
                MAX_UPSERT_RETRIES,
                exc,
                delay,
            )
            time.sleep(delay)

    assert last_error is not None
    raise last_error
