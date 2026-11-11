from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from hackatlas import util
from hackatlas.model import Event, SourceRef
from hackatlas.sources.base import Context

FIXTURES = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 11, 12, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    """Tests never wait for the 1 request/second limit."""
    monkeypatch.setattr(util, "_sleep", lambda s: None)
    util._last_request.clear()


@pytest.fixture
def ctx():
    with httpx.Client() as client:
        yield Context(client=client, now=NOW)


def fixture_text(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def make_event(name="Test Hack", year=2026, **kw) -> Event:
    from hackatlas.util import make_id

    base = {
        "id": make_id(name, year),
        "name": name,
        "url": f"https://example.com/{make_id(name, year)}",
        "sources": [SourceRef(kind="devpost", url=f"https://devpost.com/{make_id(name, year)}", seen_at=NOW)],
        "added_at": NOW,
        "updated_at": NOW,
        "starts_on": f"{year}-12-10",
    }
    base.update(kw)
    return Event(**base)
