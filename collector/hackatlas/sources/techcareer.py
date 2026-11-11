"""Techcareer.net: hackathon listing and detail pages (Next.js pages with embedded JSON)."""

from __future__ import annotations

import json
import logging
import re
from datetime import date

from hackatlas.model import Event, Location, SourceRef
from hackatlas.sources.base import Context
from hackatlas.util import http_get, make_id, parse_prize, upcoming

log = logging.getLogger("hackatlas.techcareer")

BASE = "https://www.techcareer.net"
MAX_LIST_PAGES = 5
MAX_DETAILS = 20
_DATA = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)


def page_props(page_html: str) -> dict:
    m = _DATA.search(page_html)
    return json.loads(m.group(1)).get("props", {}).get("pageProps", {}) if m else {}


def _iso(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value[:10]) if value else None
    except ValueError:
        return None


def _dmy(value: str | None) -> date | None:
    m = re.fullmatch(r"\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*", value or "")
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None
    except ValueError:
        return None


def _items(block: dict | None) -> list[dict]:
    return [e.get("attributes") or {} for e in (block or {}).get("data", [])]


def _to_event(attrs: dict, detail: dict | None, ctx: Context) -> Event | None:
    if (attrs.get("eventTypeSlug") or "").lower() != "hackathon":
        return None  # bootcamps, courses and other event types
    slug, name = attrs.get("slug"), (attrs.get("title") or "").strip()
    if not slug or not name:
        return None
    deadline = _iso(attrs.get("deadline"))
    if deadline is None or not upcoming(ctx.now, deadline):
        return None
    summary = (detail or {}).get("summary") or {}
    starts = _iso(summary.get("educationStartDate"))
    ends = _dmy(summary.get("educationDate")) or starts
    place = (summary.get("place") or "").strip()
    fmt = None
    city = None
    if place:
        fmt = "online" if place.lower() == "online" else "in_person"
        city = None if fmt == "online" else place
    loc = Location(city=city, country="TR")
    prize_text = summary.get("prizeInfo") or attrs.get("prize")
    url = f"{BASE}/hackathon/{slug}"
    return Event(
        id=make_id(name, (starts or deadline).year),
        name=name,
        organizer="Techcareer.net",
        url=url,
        format=fmt,
        location=loc,
        starts_on=starts,
        ends_on=ends,
        deadline=deadline,
        prize=parse_prize(prize_text),
        themes=[],
        sources=[SourceRef(kind="techcareer", url=url, seen_at=ctx.now)],
        added_at=ctx.now,
        updated_at=ctx.now,
    )


class TechcareerSource:
    name = "techcareer"

    def fetch(self, ctx: Context) -> list[Event]:
        attrs_list: list[dict] = []
        for page in range(1, MAX_LIST_PAGES + 1):
            try:
                resp = http_get(ctx.client, f"{BASE}/hackathon", source=self.name, params={"cpage": page})
                props = page_props(resp.text)
            except Exception as exc:
                log.warning("techcareer list page %s failed: %s", page, exc)
                break
            closed = _items(props.get("closedEvents"))
            if page == 1:
                attrs_list += _items(props.get("openEvents")) + _items(props.get("alternativeEvents"))
            attrs_list += closed
            # Closed events are newest first; stop once a whole page is in the past.
            deadlines = [d for d in (_iso(a.get("deadline")) for a in closed) if d]
            if not closed or not deadlines or max(deadlines) < ctx.now.date():
                break

        events: dict[str, Event] = {}
        details = 0
        for attrs in attrs_list:
            slug = attrs.get("slug")
            if not slug or slug in events or (attrs.get("eventTypeSlug") or "").lower() != "hackathon":
                continue
            if not upcoming(ctx.now, _iso(attrs.get("deadline"))):
                continue
            detail = None
            if details < MAX_DETAILS:
                details += 1
                try:
                    detail = page_props(
                        http_get(ctx.client, f"{BASE}/hackathon/{slug}", source=self.name).text
                    ).get("pageData")
                except Exception as exc:
                    log.warning("techcareer detail %s failed: %s", slug, exc)
            try:
                ev = _to_event(attrs, detail, ctx)
            except Exception as exc:
                log.warning("techcareer item %r skipped: %s", attrs.get("title"), exc)
                continue
            if ev:
                events[slug] = ev
        return list(events.values())


Source = TechcareerSource
