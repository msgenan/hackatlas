"""Instagram source: reads a JSONL export of collected posts and extracts hackathon announcements.

The collection itself runs outside this repo, on a machine with a logged-in browser, and writes one JSON
object per line with at least a caption and a post code. Accepted keys:
  short_code | shortCode, caption | text, owner_username | ownerUsername, timestamp, url (optional).
Path: $HACKATLAS_IG_EXPORT (no default, so a run without it does nothing).
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

from hackatlas import llm
from hackatlas.model import Event
from hackatlas.sources.base import Context

log = logging.getLogger(__name__)

KEYWORDS = re.compile(r"hackat[h]?on|datathon|ideathon|buildathon|game ?jam|codeathon|kodlama maratonu", re.I)
MAX_AGE_DAYS = 60
BATCH = 10


def post_url(post: dict) -> str | None:
    if post.get("url"):
        return str(post["url"])
    code = post.get("short_code") or post.get("shortCode")
    return f"https://www.instagram.com/p/{code}/" if code else None


def _posted_at(post: dict) -> datetime | None:
    ts = post.get("timestamp")
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return None


def load_posts(path: Path, now: datetime) -> list[dict]:
    """Recent posts that mention a hackathon-like word, newest first, one per URL."""
    cutoff = now - timedelta(days=MAX_AGE_DAYS)
    seen: set[str] = set()
    posts: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                p = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(p, dict):
                continue
            caption = p.get("caption") or p.get("text") or ""
            url = post_url(p)
            if not url or not KEYWORDS.search(caption):
                continue
            at = _posted_at(p)
            if at and at.tzinfo is None:
                at = at.replace(tzinfo=UTC)
            if at and at < cutoff:
                continue
            key = llm.norm_url(url)
            if key in seen:
                continue
            seen.add(key)
            owner = p.get("owner_username") or p.get("ownerUsername")
            posts.append({"url": url, "caption": caption, "owner": owner, "at": at})
    posts.sort(key=lambda p: p["at"] or cutoff, reverse=True)
    return posts


def render_batch(posts: list[dict]) -> str:
    parts = []
    for p in posts:
        when = p["at"].date().isoformat() if p["at"] else "unknown"
        parts.append(f"--- Instagram post\nurl: {p['url']}\naccount: @{p['owner'] or '?'}\nposted: {when}\n"
                     f"caption:\n{p['caption'][:2500]}")
    return "\n\n".join(parts)


class InstagramSource:
    name = "instagram"

    def __init__(self, client=None, path: str | None = None):
        self._client = client
        self.path = path or os.environ.get("HACKATLAS_IG_EXPORT")

    def fetch(self, ctx: Context) -> list[Event]:
        if not self.path or not Path(self.path).expanduser().is_file():
            log.warning("instagram: no export file (set HACKATLAS_IG_EXPORT), skipped")
            return []
        if self._client is None and not llm.has_credentials():
            log.warning("instagram: no Anthropic credentials, skipped")
            return []
        posts = load_posts(Path(self.path).expanduser(), ctx.now)
        log.info("instagram: %d candidate posts", len(posts))
        client = self._client or llm.make_client()
        today = ctx.now.date()
        out: list[Event] = []
        for i in range(0, len(posts), BATCH):
            batch = posts[i : i + BATCH]
            allowed = {llm.norm_url(p["url"]) for p in batch}
            try:
                for x in llm.extract(client, render_batch(batch), today, allowed):
                    ev = llm.to_event(x, "instagram", ctx.now)
                    if ev:
                        out.append(ev)
            except Exception as e:
                log.warning("instagram: batch %d failed: %s", i // BATCH, e)
        return out


Source = InstagramSource
