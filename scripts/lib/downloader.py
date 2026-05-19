"""Stream CDC CSV download to a temporary file."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1024 * 1024  # 1 MiB


def download_csv(url: str) -> Path:
    """Download CDC CSV to a temp file; returns path (caller must delete)."""
    tmp = tempfile.NamedTemporaryFile(
        prefix="cdc_wastewater_",
        suffix=".csv",
        delete=False,
    )
    path = Path(tmp.name)
    tmp.close()

    logger.info("Downloading CDC data from %s", url)
    bytes_written = 0

    with httpx.stream("GET", url, follow_redirects=True, timeout=httpx.Timeout(600.0)) as response:
        response.raise_for_status()
        with path.open("wb") as handle:
            for chunk in response.iter_bytes(chunk_size=CHUNK_SIZE):
                handle.write(chunk)
                bytes_written += len(chunk)

    logger.info("Download complete (%d bytes)", bytes_written)
    return path
