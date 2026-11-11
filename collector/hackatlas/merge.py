"""Dedup and merge candidates into approved, pending and rejected sets."""

from __future__ import annotations

import re
from dataclasses import dataclass

from pydantic import BaseModel

from hackatlas.model import Event, EventFile, RejectedFile
from hackatlas.util import fold_turkish

_ROMAN = r"(?:ii|iii|iv|vi|vii|viii|ix)"
_EDITION = re.compile(
    rf"\b(?:19|20)\d\d\b|\bv\s?\d+\b|\b\d+\s?(?:st|nd|rd|th)\b|\b\d+\.0\b|\bvol\.?\s?\d+\b|\bedition\b|\b{_ROMAN}\b"
)


def normalize_name(name: str) -> str:
    text = fold_turkish(name)
    text = _EDITION.sub(" ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def dedup_key(event: Event) -> str:
    d = event.starts_on or event.deadline or event.ends_on
    return f"{normalize_name(event.name)}|{d.year if d else ''}"


def key_from_id(event_id: str) -> str:
    """Rejected entries only store ids (<slug>-<year>); derive the same key from them."""
    slug, _, year = event_id.rpartition("-")
    if not year.isdigit():
        slug, year = event_id, ""
    return f"{normalize_name(slug.replace('-', ' '))}|{year}"


@dataclass
class MergeSummary:
    new: int = 0
    updated: int = 0
    skipped: int = 0

    def __str__(self) -> str:
        return f"{self.new} new, {self.updated} updated, {self.skipped} skipped"


def _fill(target, source) -> bool:
    """Fill None fields of target from source (recursing into nested models). Returns True when changed."""
    changed = False
    for field in type(target).model_fields:
        if field in ("sources", "id", "added_at", "updated_at"):
            continue
        cur, new = getattr(target, field), getattr(source, field)
        if new is None or new == []:
            continue
        if cur is None or cur == []:
            setattr(target, field, new)
            changed = True
        elif isinstance(cur, BaseModel) and type(cur) is type(new):
            changed |= _fill(cur, new)
    return changed


def merge_into(existing: Event, cand: Event) -> bool:
    changed = False
    known = {s.url for s in existing.sources}
    for src in cand.sources:
        if src.url not in known:
            existing.sources.append(src)
            known.add(src.url)
            changed = True
    changed |= _fill(existing, cand)
    if changed:
        existing.updated_at = cand.updated_at
    return changed


def merge_candidates(
    candidates: list[Event], approved: EventFile, pending: EventFile, rejected: RejectedFile
) -> MergeSummary:
    """Apply the merge rules in place on approved/pending. Candidates are handled one by one, so two
    candidates describing the same event (from different sources) collapse into one pending record."""
    summary = MergeSummary()
    rejected_ids = {r.id for r in rejected.rejected}
    rejected_keys = {key_from_id(i) for i in rejected_ids}

    def index(file: EventFile) -> dict[str, Event]:
        out: dict[str, Event] = {}
        for e in file.events:
            out.setdefault(e.id, e)
            out.setdefault(dedup_key(e), e)
        return out

    approved_idx, pending_idx = index(approved), index(pending)
    for cand in candidates:
        key = dedup_key(cand)
        if cand.id in rejected_ids or key in rejected_keys:
            summary.skipped += 1
            continue
        hit = approved_idx.get(cand.id) or approved_idx.get(key)
        if hit is not None:
            summary.updated += merge_into(hit, cand)
            continue
        hit = pending_idx.get(cand.id) or pending_idx.get(key)
        if hit is not None:
            summary.updated += merge_into(hit, cand)
            continue
        pending.events.append(cand)
        pending_idx[cand.id] = pending_idx[key] = cand
        summary.new += 1
    return summary
