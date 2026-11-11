"""Event data contract shared by every collector and the site.

The site reads data/events.json; collectors write candidates to data/pending.json.
Field order here is the order the site shows them in.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Format = Literal["online", "in_person", "hybrid"]
SourceKind = Literal["devpost", "mlh", "devfolio", "techcareer", "web", "instagram", "manual"]

# Controlled theme vocabulary. Collectors map their own tags onto these; unknown tags are dropped.
THEMES: tuple[str, ...] = (
    "ai",
    "web3",
    "fintech",
    "health",
    "sustainability",
    "education",
    "games",
    "mobility",
    "security",
    "social-impact",
    "hardware",
    "open",
)


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Location(_Base):
    city: str | None = None
    country: str | None = Field(None, description="ISO 3166-1 alpha-2, upper case (TR, US)")
    venue: str | None = None

    @field_validator("country")
    @classmethod
    def _upper(cls, v: str | None) -> str | None:
        return v.upper() if v else v


class Prize(_Base):
    amount: float | None = Field(None, description="Total prize pool as a number, if stated")
    currency: str | None = Field(None, description="ISO 4217 (USD, TRY, EUR)")
    text: str | None = Field(None, description="Short wording as announced, e.g. '50.000 TL + staj'")


class Team(_Base):
    min: int | None = None
    max: int | None = None


def _http_url(v: str) -> str:
    """Only absolute http(s) URLs: they end up as links on a public site."""
    v = v.strip()
    if not re.fullmatch(r"https?://[^\s<>\"']+", v, flags=re.IGNORECASE):
        raise ValueError("must be an absolute http(s) URL")
    return v


class SourceRef(_Base):
    kind: SourceKind
    url: str
    seen_at: datetime

    @field_validator("url")
    @classmethod
    def _url(cls, v: str) -> str:
        return _http_url(v)


class Event(_Base):
    id: str = Field(description="Stable slug: <name-slug>-<year>")
    name: str
    organizer: str | None = None
    url: str = Field(description="Official page or application link")
    summary: str | None = Field(None, max_length=300, description="One or two sentences in our own words")
    format: Format | None = None
    location: Location | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    deadline: date | None = Field(None, description="Last day to apply")
    prize: Prize | None = None
    team: Team | None = None
    eligibility: str | None = Field(None, description="Who can join, e.g. 'Lisans öğrencileri, 18-30 yaş'")
    themes: list[str] = Field(default_factory=list)
    sources: list[SourceRef] = Field(min_length=1)
    confidence: float | None = Field(None, ge=0, le=1, description="Only for LLM-extracted records")
    added_at: datetime
    updated_at: datetime

    @field_validator("url")
    @classmethod
    def _url(cls, v: str) -> str:
        return _http_url(v)

    @field_validator("themes")
    @classmethod
    def _known_themes(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for t in v:
            t = t.strip().lower()
            if t in THEMES and t not in out:
                out.append(t)
        return out


class EventFile(_Base):
    """Shape of data/events.json and data/pending.json."""

    events: list[Event] = Field(default_factory=list)


class Rejected(_Base):
    id: str
    reason: str | None = None
    rejected_at: datetime


class RejectedFile(_Base):
    """Shape of data/rejected.json: ids that must never be proposed again."""

    rejected: list[Rejected] = Field(default_factory=list)
