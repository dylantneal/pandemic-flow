"""CDC raw CSV ingestion orchestration."""

from __future__ import annotations

import csv
import logging
import sys
from pathlib import Path
from typing import Any

from scripts.lib.cdc_schema import (
    EXPECTED_COLUMNS,
    compute_row_hash,
    normalize_row,
    schema_hash,
    validate_header,
)
from scripts.lib.config import BATCH_SIZE, IngestionConfig
from scripts.lib.downloader import download_csv
from scripts.lib.storage_upload import upload_snapshot_parts
from scripts.lib.supabase_client import (
    build_snapshot_prefix,
    create_service_client,
    finish_ingestion_run,
    get_data_source_id,
    start_ingestion_run,
    update_data_source_after_success,
    upsert_raw_batch,
)

logger = logging.getLogger(__name__)


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )


def ingest_cdc(config: IngestionConfig, *, csv_path: Path | None = None) -> int:
    """Run full CDC ingestion. Returns exit code (0 success, 1 failure)."""
    _setup_logging()
    client = create_service_client(config)
    data_source_id = get_data_source_id(client)
    run_id = start_ingestion_run(
        client,
        data_source_id=data_source_id,
        trigger_type=config.trigger_type,
        git_commit=config.git_commit,
    )

    local_path: Path | None = csv_path
    downloaded = False
    snapshot_path: str | None = None
    source_row_count = 0
    upserted_total = 0
    skipped = 0
    latest_date_updated: str | None = None
    batch: list[dict[str, Any]] = []

    try:
        if local_path is None:
            local_path = download_csv(config.cdc_csv_url)
            downloaded = True

        snapshot_prefix = build_snapshot_prefix()
        snapshot_paths = upload_snapshot_parts(client, local_path, snapshot_prefix)
        snapshot_path = ",".join(snapshot_paths)

        with local_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames is None:
                raise ValueError("CSV has no header row")
            validate_header(list(reader.fieldnames))

            for source_row in reader:
                source_row_count += 1
                try:
                    normalized = normalize_row(source_row)
                    row_hash = compute_row_hash(normalized)
                    du = normalized.get("date_updated")
                    if du and (latest_date_updated is None or du > latest_date_updated):
                        latest_date_updated = du

                    record = {
                        **normalized,
                        "ingestion_run_id": run_id,
                        "row_hash": row_hash,
                    }
                    batch.append(record)

                    if len(batch) >= BATCH_SIZE:
                        inserted, _ = upsert_raw_batch(client, batch)
                        upserted_total += inserted
                        logger.info(
                            "Progress: %d source rows processed, %d upserted",
                            source_row_count,
                            upserted_total,
                        )
                        batch.clear()

                except ValueError as exc:
                    skipped += 1
                    logger.warning(
                        "Skipping row %d (%s): %s",
                        source_row_count,
                        source_row.get("record_id", "?"),
                        exc,
                    )

            if batch:
                inserted, _ = upsert_raw_batch(client, batch)
                upserted_total += inserted

        status = "success" if skipped == 0 else "partial"
        finish_ingestion_run(
            client,
            run_id,
            status=status,
            source_row_count=source_row_count,
            inserted_count=upserted_total,
            updated_count=0,
            skipped_count=skipped,
            raw_snapshot_path=snapshot_path,
        )
        update_data_source_after_success(
            client,
            data_source_id,
            schema_hash=schema_hash(),
            latest_source_updated_at=latest_date_updated,
        )

        logger.info(
            "Ingestion complete: status=%s source_rows=%d upserted=%d skipped=%d snapshot=%s",
            status,
            source_row_count,
            upserted_total,
            skipped,
            snapshot_path,
        )
        return 0

    except Exception as exc:
        logger.exception("Ingestion failed: %s", exc)
        finish_ingestion_run(
            client,
            run_id,
            status="failed",
            source_row_count=source_row_count,
            inserted_count=upserted_total,
            skipped_count=skipped,
            error_message=str(exc),
            raw_snapshot_path=snapshot_path,
        )
        return 1

    finally:
        if downloaded and local_path is not None and local_path.exists():
            local_path.unlink(missing_ok=True)
