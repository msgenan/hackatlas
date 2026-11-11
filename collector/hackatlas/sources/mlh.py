"""Major League Hacking: season events page (data embedded as JSON in the page)."""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime

from hackatlas.model import Event, Location, SourceRef
from hackatlas.sources.base import Context
from hackatlas.util import country_code, http_get, make_id, upcoming

log = logging.getLogger("hackatlas.mlh")

BASE = "https://www.mlh.com"  # mlh.io redirects here
MAX_PAGES = 6
_DATA = re.compile(r'<script data-page="app" type="application/json">(.*?)</script>', re.S)
_FORMATS = {
    "physical": "in_person",
    "digital": "online",
    "hybrid_physical": "hybrid",
    "hybrid": "hybrid",
    "hybrid_digital": "hybrid",
}


def season_year(now: datetime) -> int:
    """MLH seasons start in August and are named after the following year."""
    return now.year + 1 if now.month >= 8 else now.year


def parse_events(page_html: str) -> list[dict]:
    m = _DATA.search(page_html)
    if not m:
        return []
    return json.loads(m.group(1)).get("props", {}).get("upcomingEvents", [])


_MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1
    )
}
_RANGE = re.compile(
    r"([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:\s*[-–]\s*(?:([A-Za-z]{3})[a-z]*\.?\s+)?(\d{1,2}))?"
)


def local_dates(item: dict, starts_utc: date | None) -> tuple[date | None, date | None]:
    """MLH gives UTC timestamps plus a local 'dateRange' such as 'OCT 31 - NOV 01'; prefer the local days."""
    m = _RANGE.fullmatch((item.get("dateRange") or "").strip())
    if not m or starts_utc is None or m.group(1).lower() not in _MONTHS:
        return None, None
    s_month, s_day = _MONTHS[m.group(1).lower()], int(m.group(2))
    e_month = _MONTHS.get((m.group(3) or m.group(1)).lower(), s_month)
    e_day = int(m.group(4) or m.group(2))
    try:
        start = min(
            (date(y, s_month, s_day) for y in (starts_utc.year - 1, starts_utc.year, starts_utc.year + 1)),
            key=lambda d: abs((d - starts_utc).days),
        )
        end = date(start.year + (1 if e_month < s_month else 0), e_month, e_day)
    except ValueError:
        return None, None
    return (start, end) if abs((start - starts_utc).days) <= 1 and end >= start else (None, None)


def _to_event(item: dict, ctx: Context) -> Event | None:
    name = (item.get("name") or "").strip()
    url = (item.get("websiteUrl") or "").strip()
    if not url and item.get("url"):
        url = BASE + item["url"]
    if not name or not url:
        return None
    starts = (
        datetime.fromisoformat(item["startsAt"].replace("Z", "+00:00")).date()
        if item.get("startsAt")
        else None
    )
    ends = (
        datetime.fromisoformat(item["endsAt"].replace("Z", "+00:00")).date() if item.get("endsAt") else starts
    )
    local_start, local_end = local_dates(item, starts)
    starts, ends = local_start or starts, local_end or ends
    if not upcoming(ctx.now, ends, starts):
        return None
    fmt = _FORMATS.get(item.get("formatType") or "")
    addr = item.get("venueAddress") or {}
    city = (addr.get("city") or "").strip() or None
    country = country_code(addr.get("country"))
    loc = Location(city=city, country=country) if (city or country) and fmt != "online" else None
    # The date on MLH is the event window; there is no separate application deadline.
    return Event(
        id=make_id(name, (starts or ends).year),
        name=name,
        organizer=(item.get("organizationName") or None),
        url=url,
        format=fmt,
        location=loc,
        starts_on=starts,
        ends_on=ends,
        deadline=None,
        themes=[],
        sources=[
            SourceRef(
                kind="mlh", url=f"{BASE}/events/{item['slug']}" if item.get("slug") else url, seen_at=ctx.now
            )
        ],
        added_at=ctx.now,
        updated_at=ctx.now,
    )


class MlhSource:
    name = "mlh"

    def fetch(self, ctx: Context) -> list[Event]:
        events: dict[str, Event] = {}
        url = f"{BASE}/seasons/{season_year(ctx.now)}/events"
        for page in range(1, MAX_PAGES + 1):
            try:
                resp = http_get(ctx.client, url, source=self.name, params={"upcoming_page": page})
                items = parse_events(resp.text)
            except Exception as exc:
                log.warning("mlh page %s failed: %s", page, exc)
                break
            if not items:
                break
            for item in items:
                try:
                    ev = _to_event(item, ctx)
                except Exception as exc:
                    log.warning("mlh item %r skipped: %s", item.get("name"), exc)
                    continue
                if ev:
                    events.setdefault(item.get("id") or ev.id, ev)
        return list(events.values())


Source = MlhSource
