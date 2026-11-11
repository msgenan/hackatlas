"""Devpost: public JSON listing of open and upcoming hackathons."""

from __future__ import annotations

import logging
import re
from datetime import date

from hackatlas.model import Event, Location, SourceRef
from hackatlas.sources.base import Context
from hackatlas.util import country_code, http_get, make_id, map_themes, parse_prize, upcoming

log = logging.getLogger("hackatlas.devpost")

API = "https://devpost.com/api/hackathons"
MAX_PAGES = 10

_MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1
    )
}
_PART = re.compile(r"([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?")


def parse_period(text: str | None) -> tuple[date | None, date | None]:
    """'Oct 01 - Nov 12, 2026', 'Nov 11 - 30, 2026', 'Dec 28, 2026 - Jan 05, 2027', 'Nov 20, 2026'."""
    if not text:
        return None, None
    parts = [p.strip() for p in re.split(r"\s+[-–]\s+", text.strip())]
    year_m = re.search(r"(\d{4})\s*$", text.strip())
    if not year_m or len(parts) > 2:
        return None, None
    end_year = int(year_m.group(1))
    left = _PART.fullmatch(parts[0])
    if not left or left.group(1).lower() not in _MONTHS:
        return None, None
    l_month, l_day = _MONTHS[left.group(1).lower()], int(left.group(2))
    try:
        if len(parts) == 1:
            d = date(end_year, l_month, l_day)
            return d, d
        right = _PART.fullmatch(parts[1])
        if right and right.group(1).lower() in _MONTHS:
            r_month, r_day = _MONTHS[right.group(1).lower()], int(right.group(2))
        elif re.fullmatch(r"\d{1,2}(?:,\s*\d{4})?", parts[1]):
            r_month, r_day = l_month, int(re.match(r"\d+", parts[1]).group(0))
        else:
            return None, None
        end = date(end_year, r_month, r_day)
        l_year = int(left.group(3)) if left.group(3) else (end_year if l_month <= r_month else end_year - 1)
        return date(l_year, l_month, l_day), end
    except ValueError:
        return None, None


def _location(raw: str | None) -> tuple[str | None, Location | None]:
    if not raw:
        return None, None
    raw = raw.strip()
    if raw.lower() == "online":
        return "online", None
    if re.search(r"\+\s*online|online\s*\+", raw, re.I):
        place = re.sub(r"\s*\+\s*online|online\s*\+\s*", "", raw, flags=re.I).strip()
        return "hybrid", Location(venue=place or None)
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    country = country_code(parts[-1]) if len(parts) > 1 else None
    if len(parts) >= 2 and country:
        return "in_person", Location(city=parts[0], country=country)
    # A lone string can be a venue or a city; Devpost does not say which, keep it as venue.
    return "in_person", Location(venue=raw)


def _to_event(item: dict, ctx: Context) -> Event | None:
    if item.get("invite_only"):
        return None
    name = (item.get("title") or "").strip()
    url = (item.get("url") or "").strip()
    if not name or not url:
        return None
    starts, ends = parse_period(item.get("submission_period_dates"))
    if not upcoming(ctx.now, ends, starts):
        return None
    fmt, loc = _location((item.get("displayed_location") or {}).get("location"))
    year = (starts or ends or ctx.now).year
    return Event(
        id=make_id(name, year),
        name=name,
        organizer=(item.get("organization_name") or None),
        url=url,
        format=fmt,
        location=loc,
        starts_on=starts,
        ends_on=ends,
        deadline=ends,
        prize=parse_prize(item.get("prize_amount")),
        themes=map_themes([t.get("name", "") for t in item.get("themes") or []]),
        sources=[SourceRef(kind="devpost", url=url, seen_at=ctx.now)],
        added_at=ctx.now,
        updated_at=ctx.now,
    )


class DevpostSource:
    name = "devpost"

    def fetch(self, ctx: Context) -> list[Event]:
        events: list[Event] = []
        seen: set[int | str] = set()
        for page in range(1, MAX_PAGES + 1):
            try:
                resp = http_get(
                    ctx.client,
                    API,
                    source=self.name,
                    params=[("status[]", "upcoming"), ("status[]", "open"), ("page", page)],
                )
                items = resp.json().get("hackathons", [])
            except Exception as exc:  # network or JSON failure ends paging, keeps what we have
                log.warning("devpost page %s failed: %s", page, exc)
                break
            if not items:
                break
            for item in items:
                if item.get("id") in seen:
                    continue
                seen.add(item.get("id"))
                try:
                    ev = _to_event(item, ctx)
                except Exception as exc:
                    log.warning("devpost item %r skipped: %s", item.get("title"), exc)
                    continue
                if ev:
                    events.append(ev)
        return events


Source = DevpostSource
