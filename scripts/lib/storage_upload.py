"""Split and upload large CDC CSV snapshots within Supabase Storage limits."""

from __future__ import annotations

import csv
import io
import logging
import tempfile
from pathlib import Path

from supabase import Client

from scripts.lib.config import STORAGE_BUCKET

logger = logging.getLogger(__name__)

# Supabase free-tier global upload limit is 50 MiB; stay under with margin.
MAX_PART_BYTES = 45 * 1024 * 1024


def split_csv_parts(source: Path, max_bytes: int = MAX_PART_BYTES) -> list[Path]:
    """
    Split a CSV into multiple part files, each with the header row.
    Splits on row boundaries so parts stay under max_bytes when possible.
    """
    parts: list[Path] = []
    tmp_dir = Path(tempfile.mkdtemp(prefix="cdc_snapshot_parts_"))

    def _row_byte_size(row: list[str]) -> int:
        buffer = io.StringIO()
        csv.writer(buffer).writerow(row)
        return len(buffer.getvalue().encode("utf-8"))

    with source.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        header_bytes = _row_byte_size(header)

        part_index = 1
        current_path = tmp_dir / f"part_{part_index:03d}.csv"
        current_file = current_path.open("w", encoding="utf-8", newline="")
        current_writer = csv.writer(current_file)
        current_writer.writerow(header)
        current_size = header_bytes
        parts.append(current_path)

        for row in reader:
            row_bytes = _row_byte_size(row)

            if current_size + row_bytes > max_bytes and current_size > header_bytes:
                current_file.close()
                part_index += 1
                current_path = tmp_dir / f"part_{part_index:03d}.csv"
                current_file = current_path.open("w", encoding="utf-8", newline="")
                current_writer = csv.writer(current_file)
                current_writer.writerow(header)
                current_size = header_bytes
                parts.append(current_path)

            current_writer.writerow(row)
            current_size += row_bytes

        current_file.close()

    logger.info("Split snapshot into %d part(s)", len(parts))
    return parts


def upload_snapshot_parts(
    client: Client,
    source: Path,
    storage_prefix: str,
) -> list[str]:
    """
    Upload CSV snapshot as one or more Storage objects.
    Returns list of storage paths uploaded.
    """
    parts = split_csv_parts(source)
    uploaded: list[str] = []

    for index, part_path in enumerate(parts, start=1):
        suffix = f"_part{index:02d}of{len(parts):02d}.csv" if len(parts) > 1 else ".csv"
        storage_path = f"{storage_prefix}{suffix}"
        size = part_path.stat().st_size
        logger.info(
            "Uploading snapshot part %d/%d (%d bytes) to %s/%s",
            index,
            len(parts),
            size,
            STORAGE_BUCKET,
            storage_path,
        )

        with part_path.open("rb") as handle:
            data = handle.read()

        if len(data) > MAX_PART_BYTES + (1024 * 1024):
            raise RuntimeError(
                f"Part {storage_path} is {len(data)} bytes; increase split count or max part size"
            )

        client.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=data,
            file_options={
                "content-type": "text/csv",
                "upsert": "true",
            },
        )
        uploaded.append(storage_path)
        part_path.unlink(missing_ok=True)

    part_dir = parts[0].parent if parts else None
    if part_dir and part_dir.exists():
        try:
            part_dir.rmdir()
        except OSError:
            pass

    return uploaded
