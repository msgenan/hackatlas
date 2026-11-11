"""Read and write the JSON data files with stable, diff-friendly output."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from pydantic import BaseModel

from hackatlas.model import Event, EventFile, RejectedFile

EVENTS, PENDING, REJECTED = "events.json", "pending.json", "rejected.json"


def default_data_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "data"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def sort_key(e: Event) -> tuple:
    far = "9999-12-31"
    return (
        e.deadline.isoformat() if e.deadline else far,
        e.starts_on.isoformat() if e.starts_on else far,
        e.id,
    )


def _write_atomic(path: Path, model: BaseModel) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(model.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n"
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _load_events(path: Path) -> EventFile:
    if not path.exists():
        return EventFile()
    return EventFile.model_validate_json(path.read_text(encoding="utf-8"))


def load_events(data_dir: Path) -> EventFile:
    return _load_events(Path(data_dir) / EVENTS)


def load_pending(data_dir: Path) -> EventFile:
    return _load_events(Path(data_dir) / PENDING)


def load_rejected(data_dir: Path) -> RejectedFile:
    path = Path(data_dir) / REJECTED
    if not path.exists():
        return RejectedFile()
    return RejectedFile.model_validate_json(path.read_text(encoding="utf-8"))


def save_events(data_dir: Path, file: EventFile) -> None:
    _write_atomic(Path(data_dir) / EVENTS, EventFile(events=sorted(file.events, key=sort_key)))


def save_pending(data_dir: Path, file: EventFile) -> None:
    _write_atomic(Path(data_dir) / PENDING, EventFile(events=sorted(file.events, key=sort_key)))


def save_rejected(data_dir: Path, file: RejectedFile) -> None:
    ordered = sorted(file.rejected, key=lambda r: (r.rejected_at, r.id))
    _write_atomic(Path(data_dir) / REJECTED, RejectedFile(rejected=ordered))
