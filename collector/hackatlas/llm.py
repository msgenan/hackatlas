"""Claude API helpers: turn free text (search findings, social posts) into Event records.

Two calls per batch keep each step simple and checkable:
1. (web source only) a search call with the server-side web search tool returns findings as plain text;
2. an extraction call with structured output maps text onto ExtractedEvent.
Every extracted record must name a source URL that we actually saw; others are dropped.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from hackatlas.model import THEMES, Event, Location, Prize, SourceKind, SourceRef, Team
from hackatlas.util import make_id, map_themes

log = logging.getLogger(__name__)

# Haiku keeps a daily run at cents. If the search tool is rejected for this model, switch to
# HACKATLAS_MODEL=claude-sonnet-5-5 and HACKATLAS_SEARCH_TOOL=web_search_20260209.
MODEL = os.environ.get("HACKATLAS_MODEL", "claude-haiku-5-5")
SEARCH_TOOL = os.environ.get("HACKATLAS_SEARCH_TOOL", "web_search_20250305")


class ExtractedEvent(BaseModel):
    """Flat shape the model fills. Dates are YYYY-MM-DD strings or null."""

    is_hackathon: bool
    name: str
    organizer: str | None
    url: str | None
    source_url: str
    summary: str | None
    format: Literal["online", "in_person", "hybrid"] | None
    city: str | None
    country: str | None
    starts_on: str | None
    ends_on: str | None
    deadline: str | None
    prize_amount: float | None
    prize_currency: str | None
    prize_text: str | None
    team_min: int | None
    team_max: int | None
    eligibility: str | None
    themes: list[str]
    confidence: float


class Extraction(BaseModel):
    events: list[ExtractedEvent]


EXTRACT_SYSTEM = f"""You turn hackathon announcements into structured records for a Turkish hackathon listing.

Rules:
- One record per distinct event. Hackathon-like events count: hackathon, datathon, ideathon, buildathon,
  game jam, coding competitions with a build phase. Courses, bootcamps, talks, webinars and job ads do not:
  set is_hackathon=false for them (or leave them out).
- Use only facts stated in the input. Never guess a date, prize, city or team size; use null when not stated.
- Dates as YYYY-MM-DD. Resolve a missing year from context and today's date; if still unclear, null.
- deadline is the last day to apply/register. If only a submission end is given for an online event, use it.
- format: online, in_person or hybrid; null if unclear. country: ISO 3166-1 alpha-2 (TR for Turkey).
- prize_amount: total pool as a number only when stated (50.000 TL -> 50000, TRY). prize_text: short wording
  as announced, for example "50.000 TL + staj".
- summary: one or two sentences in Turkish, in your own words, max 280 characters. Do not copy the post.
- themes: choose from {", ".join(THEMES)}.
- url: the official page or application link if given, else null. source_url: the exact URL of the page or
  post the facts came from, copied exactly from the input.
- confidence 0-1: how sure you are that the record is a real, upcoming hackathon with correct facts.
"""

SEARCH_SYSTEM = """You research upcoming hackathons for a Turkish hackathon listing. Use web search.
Report every distinct hackathon-like event you find whose application deadline or event date is today or
later. For each, list on separate lines: name, organizer, dates, application deadline, city/online, prize,
team size, who can join, official link, and the exact URL of the page where you read it.
Only report facts you read on a page. Skip courses, bootcamps and events that are already over.
Answer in plain text, no preamble."""


def _parse_date(value: str | None, today: date) -> date | None:
    if not value:
        return None
    try:
        d = date.fromisoformat(value[:10])
    except ValueError:
        return None
    if not (today.year - 1 <= d.year <= today.year + 2):
        return None
    return d


def to_event(x: ExtractedEvent, kind: SourceKind, seen_at: datetime) -> Event | None:
    """Map one model record onto the Event contract; None when it is not a usable upcoming event."""
    if not x.is_hackathon or not x.name.strip():
        return None
    today = seen_at.date()
    starts = _parse_date(x.starts_on, today)
    ends = _parse_date(x.ends_on, today) or starts
    deadline = _parse_date(x.deadline, today)
    last_relevant = max([d for d in (deadline, ends) if d], default=None)
    if last_relevant is None or last_relevant < today:
        return None  # no date at all, or already over
    year = (starts or deadline or today).year

    location = None
    if x.city or x.country:
        location = Location(city=x.city, country=(x.country or None))
    prize = None
    if x.prize_amount is not None or x.prize_text:
        prize = Prize(amount=x.prize_amount, currency=(x.prize_currency or None), text=x.prize_text)
    team = None
    if x.team_min is not None or x.team_max is not None:
        team = Team(min=x.team_min, max=x.team_max)

    summary = (x.summary or "").strip() or None
    if summary and len(summary) > 300:
        summary = summary[:297].rstrip() + "..."

    return Event(
        id=make_id(x.name, year),
        name=x.name.strip(),
        organizer=x.organizer,
        url=x.url or x.source_url,
        summary=summary,
        format=x.format,
        location=location,
        starts_on=starts,
        ends_on=ends,
        deadline=deadline,
        prize=prize,
        team=team,
        eligibility=x.eligibility,
        themes=map_themes(x.themes),
        sources=[SourceRef(kind=kind, url=x.source_url, seen_at=seen_at)],
        confidence=max(0.0, min(1.0, x.confidence)),
        added_at=seen_at,
        updated_at=seen_at,
    )


def has_credentials() -> bool:
    return bool(
        os.environ.get("ANTHROPIC_API_KEY")
        or os.environ.get("ANTHROPIC_AUTH_TOKEN")
        or os.environ.get("ANTHROPIC_PROFILE")
        or os.environ.get("HACKATLAS_LLM") == "1"
    )


def make_client():
    import anthropic

    return anthropic.Anthropic(max_retries=3, timeout=120.0)


def extract(client, text: str, today: date, allowed_urls: set[str]) -> list[ExtractedEvent]:
    """Structured extraction; keeps only records whose source_url is one we actually saw."""
    response = client.messages.parse(
        model=MODEL,
        max_tokens=16000,
        system=EXTRACT_SYSTEM,
        messages=[{"role": "user", "content": f"Today is {today.isoformat()}.\n\n{text}"}],
        output_format=Extraction,
    )
    if response.stop_reason == "refusal":
        log.warning("extraction refused (request %s)", getattr(response, "_request_id", "?"))
        return []
    if response.stop_reason == "max_tokens":
        log.warning("extraction hit max_tokens; batch skipped")
        return []
    parsed = response.parsed_output
    if parsed is None:
        return []
    kept = []
    for x in parsed.events:
        if _norm_url(x.source_url) in allowed_urls:
            kept.append(x)
        else:
            log.info("dropped %r: source_url not among seen URLs", x.name)
    return kept


def search(client, query: str, today: date, max_uses: int = 3) -> tuple[str, set[str]]:
    """One web search turn. Returns the findings text and the set of result URLs seen."""
    messages = [
        {"role": "user", "content": f"Today is {today.isoformat()}. Search: {query}"},
    ]
    tools = [
        {
            "type": SEARCH_TOOL,
            "name": "web_search",
            "max_uses": max_uses,
            "user_location": {
                "type": "approximate",
                "city": "Istanbul",
                "country": "TR",
                "timezone": "Europe/Istanbul",
            },
        }
    ]
    texts: list[str] = []
    urls: set[str] = set()
    for _ in range(4):  # initial call + up to 3 pause_turn continuations
        response = client.messages.create(
            model=MODEL, max_tokens=16000, system=SEARCH_SYSTEM, messages=messages, tools=tools
        )
        for block in response.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                texts.append(block.text)
                for c in getattr(block, "citations", None) or []:
                    if getattr(c, "url", None):
                        urls.add(_norm_url(c.url))
            elif btype == "web_search_tool_result":
                content = block.content
                if isinstance(content, list):  # an error is a single object, not a list
                    for r in content:
                        if getattr(r, "url", None):
                            urls.add(_norm_url(r.url))
                else:
                    log.warning("web search error: %s", getattr(content, "error_code", content))
        if response.stop_reason != "pause_turn":
            break
        messages = messages[:1] + [{"role": "assistant", "content": response.content}]
    return "\n".join(texts).strip(), urls


def _norm_url(url: str) -> str:
    u = url.strip()
    if "#" in u:
        u = u.split("#", 1)[0]
    return u.rstrip("/").lower()


norm_url = _norm_url
