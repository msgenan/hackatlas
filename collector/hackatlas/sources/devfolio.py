"""Devfolio: the JSON search API the hackathons page itself uses (open + upcoming)."""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from hackatlas.model import Event, Location, SourceRef, Team
from hackatlas.sources.base import Context
from hackatlas.util import country_code, http_post, make_id, map_themes, parse_prize, upcoming

log = logging.getLogger("hackatlas.devfolio")

API = "https://api.devfolio.co/api/search/hackathons"
TYPES = ("application_open", "upcoming")


def _day(value: str | None, tz: str | None = None, *, closing: bool = False) -> date | None:
    """Calendar date in the event's own timezone (Devfolio stores UTC; Indian events start at 18:30Z).

    closing=True: a registration that ends exactly at local midnight closes at the end of the previous day.
    """
    if not value:
        return None
    moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    try:
        moment = moment.astimezone(ZoneInfo(tz)) if tz else moment
    except ZoneInfoNotFoundError:
        pass
    if closing and moment.time() == time(0, 0):
        return moment.date() - timedelta(days=1)
    return moment.date()


def _prize(prizes: list[dict]):
    """Devfolio prizes are free text; only trust an explicit pool/total line."""
    for p in prizes or []:
        label = f"{p.get('name') or ''} {p.get('desc') or ''}"
        if any(w in label.lower() for w in ("pool", "total")):
            parsed = parse_prize(p.get("desc") or p.get("name"))
            if parsed and parsed.amount:
                return parsed
    return None


def _to_event(src: dict, ctx: Context) -> Event | None:
    if src.get("private") or src.get("type") not in (None, "HACKATHON"):
        return None
    name = (src.get("name") or "").strip()
    setting = src.get("hackathon_setting") or {}
    sub = setting.get("subdomain") or src.get("slug")
    if not name or not sub:
        return None
    url = f"https://{sub}.devfolio.co/"
    tz = src.get("timezone")
    starts = _day(src.get("starts_at"), tz)
    ends = _day(src.get("ends_at"), tz)
    deadline = _day(setting.get("reg_ends_at"), tz, closing=True)
    if not upcoming(ctx.now, deadline, ends, starts):
        return None
    if src.get("is_online"):
        fmt, loc = "online", None
    else:
        fmt = "in_person"
        city, country = src.get("city"), country_code(src.get("country"))
        loc = Location(city=city, country=country) if (city or country) else None
    team = (
        Team(min=src.get("team_min"), max=src.get("team_size"))
        if src.get("team_min") or src.get("team_size")
        else None
    )
    themes = [(t.get("theme") or t).get("name", "") for t in src.get("themes") or []]
    year = (starts or deadline or ends or ctx.now).year
    return Event(
        id=make_id(name, year),
        name=name,
        organizer=(src.get("hosted_by") or None),
        url=url,
        format=fmt,
        location=loc,
        starts_on=starts,
        ends_on=ends,
        deadline=deadline,
        prize=_prize(src.get("prizes")),
        team=team,
        themes=map_themes(themes),
        sources=[SourceRef(kind="devfolio", url=url, seen_at=ctx.now)],
        added_at=ctx.now,
        updated_at=ctx.now,
    )


class DevfolioSource:
    name = "devfolio"

    def fetch(self, ctx: Context) -> list[Event]:
        events: dict[str, Event] = {}
        for kind in TYPES:
            try:
                resp = http_post(
                    ctx.client, API, source=self.name, json={"type": kind, "from": 0, "size": 100}
                )
                hits = resp.json()["hits"]["hits"]
            except Exception as exc:
                log.warning("devfolio %s failed: %s", kind, exc)
                continue
            for hit in hits:
                src = hit.get("_source") or {}
                try:
                    ev = _to_event(src, ctx)
                except Exception as exc:
                    log.warning("devfolio item %r skipped: %s", src.get("name"), exc)
                    continue
                if ev:
                    events.setdefault(src.get("uuid") or ev.id, ev)
        return list(events.values())


Source = DevfolioSource
