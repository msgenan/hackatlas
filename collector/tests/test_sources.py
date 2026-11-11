import httpx
import respx

from hackatlas import sources
from hackatlas.sources.devfolio import DevfolioSource
from hackatlas.sources.devpost import DevpostSource, parse_period
from hackatlas.sources.mlh import MlhSource
from hackatlas.sources.techcareer import TechcareerSource

from .conftest import NOW, fixture_text


def by_name(events):
    return {e.name: e for e in events}


def test_parse_period():
    from datetime import date

    assert parse_period("Oct 01 - Nov 12, 2026") == (date(2026, 10, 1), date(2026, 11, 12))
    assert parse_period("Nov 11 - 30, 2026") == (date(2026, 11, 11), date(2026, 11, 30))
    assert parse_period("Dec 28 - Jan 05, 2027") == (date(2026, 12, 28), date(2027, 1, 5))
    assert parse_period("Nov 20, 2026") == (date(2026, 11, 20),) * 2
    assert parse_period("soon") == (None, None)


@respx.mock
def test_devpost_mapping(ctx):
    respx.get("https://devpost.com/api/hackathons", params={"page": "1"}).mock(
        return_value=httpx.Response(200, text=fixture_text("devpost_page1.json"))
    )
    respx.get("https://devpost.com/api/hackathons", params={"page": "2"}).mock(
        return_value=httpx.Response(200, text=fixture_text("devpost_empty.json"))
    )
    events = by_name(DevpostSource().fetch(ctx))
    # invite-only and past events are dropped, an event ending today is kept
    assert set(events) == {
        "PayPal AI Hackathon",
        "Kiroween 2026",
        "HackStorm 3.0: Sense, Think and Act",
        "DeveloperWeek 2027 Hackathon",
        "BearHacks 2027",
    }
    paypal = events["PayPal AI Hackathon"]
    assert paypal.id == "paypal-ai-hackathon-2026"
    assert paypal.organizer == "PayPal"
    assert paypal.format == "online" and paypal.location is None
    assert paypal.deadline == paypal.ends_on and paypal.deadline.isoformat() == "2026-11-12"
    assert paypal.starts_on.isoformat() == "2026-10-01"
    assert paypal.prize.amount == 67500 and paypal.prize.currency == "USD"
    assert paypal.themes == ["ai"]
    assert paypal.sources[0].kind == "devpost"
    sf = events["HackStorm 3.0: Sense, Think and Act"]
    assert sf.format == "in_person" and sf.location.city == "San Francisco" and sf.location.country == "US"
    assert events["DeveloperWeek 2027 Hackathon"].format == "hybrid"
    assert events["BearHacks 2027"].prize.currency == "CAD"
    assert events["BearHacks 2027"].location.venue == "Sheridan College Hazel McCallion Campus"


@respx.mock
def test_devpost_survives_http_error(ctx):
    respx.get("https://devpost.com/api/hackathons").mock(return_value=httpx.Response(404))
    assert DevpostSource().fetch(ctx) == []


@respx.mock
def test_mlh_mapping(ctx):
    respx.get("https://www.mlh.com/seasons/2027/events", params={"upcoming_page": "1"}).mock(
        return_value=httpx.Response(200, text=fixture_text("mlh_events.html"))
    )
    respx.get("https://www.mlh.com/seasons/2027/events", params={"upcoming_page": "2"}).mock(
        return_value=httpx.Response(200, text=fixture_text("mlh_empty.html"))
    )
    events = MlhSource().fetch(ctx)
    assert len(events) == 3  # the edited past event is dropped
    first = events[0]
    assert first.name == "Emory Hacks"
    assert first.format == "in_person"
    assert (first.location.city, first.location.country) == ("Atlanta", "US")
    assert first.starts_on.isoformat() == "2026-11-13" and first.ends_on.isoformat() == "2026-11-15"
    assert first.url == "https://emoryhacks.com/"
    assert first.sources[0].kind == "mlh" and first.sources[0].url.startswith("https://www.mlh.com/events/")
    assert any(e.format == "hybrid" for e in events)


def test_mlh_season_year():
    from datetime import UTC, datetime

    from hackatlas.sources.mlh import season_year

    assert season_year(datetime(2026, 11, 12, tzinfo=UTC)) == 2027
    assert season_year(datetime(2027, 3, 1, tzinfo=UTC)) == 2027
    assert season_year(datetime(2027, 8, 1, tzinfo=UTC)) == 2028


@respx.mock
def test_devfolio_mapping(ctx):
    respx.post("https://api.devfolio.co/api/search/hackathons").mock(
        side_effect=[
            httpx.Response(200, text=fixture_text("devfolio_open.json")),
            httpx.Response(200, text=fixture_text("devfolio_empty.json")),
        ]
    )
    events = by_name(DevfolioSource().fetch(ctx))
    assert "Edited Past Hackathon" not in events
    nexus = events["DevNexus 2.0"]
    assert nexus.url == "https://devnexus2.devfolio.co/"
    assert nexus.format == "in_person"
    assert (nexus.location.city, nexus.location.country) == ("Kolkata", "IN")
    # Devfolio stores UTC; the event runs Nov 28-29 in India
    assert nexus.starts_on.isoformat() == "2026-11-28" and nexus.ends_on.isoformat() == "2026-11-29"
    assert nexus.deadline.isoformat() == "2026-11-13"
    assert (nexus.team.min, nexus.team.max) == (2, 4)
    assert events["hackodisha-6.0"].format == "online"
    assert events["Hack For Tomorrow 2026"].prize.amount == 30000
    assert events["Hack For Tomorrow 2026"].prize.currency == "INR"
    assert set(events["ETHChiangmai & Longevity Hackathon 2026"].themes) == {"ai", "web3", "health"}


@respx.mock
def test_techcareer_keeps_only_future_hackathons(ctx):
    respx.get("https://www.techcareer.net/hackathon", params={"cpage": "1"}).mock(
        return_value=httpx.Response(200, text=fixture_text("techcareer_list.html"))
    )
    detail = respx.get("https://www.techcareer.net/hackathon/edited-open-hackathon").mock(
        return_value=httpx.Response(200, text=fixture_text("techcareer_detail.html"))
    )
    events = TechcareerSource().fetch(ctx)
    # past hackathons and the bootcamp are skipped
    assert [e.name for e in events] == ["Edited Open Hackathon"]
    ev = events[0]
    assert detail.called
    assert ev.deadline.isoformat() == "2026-12-01"
    assert ev.starts_on.isoformat() == "2026-12-18" and ev.ends_on.isoformat() == "2026-12-20"
    assert ev.format == "online" and ev.location.country == "TR"
    assert ev.prize.amount == 50000 and ev.prize.currency == "TRY"
    assert ev.sources[0].kind == "techcareer"


def test_registry_loads_and_reports_missing_module():
    import pytest

    assert set(sources.SOURCES) == {"devpost", "mlh", "devfolio", "techcareer", "web", "instagram"}
    assert sources.load("devpost").name == "devpost"
    with pytest.raises(KeyError):
        sources.load("nope")
    sources.SOURCES["ghost"] = "hackatlas.sources.does_not_exist"
    try:
        with pytest.raises(ImportError, match="not available"):
            sources.load("ghost")
    finally:
        del sources.SOURCES["ghost"]


def test_fixed_now_is_utc():
    assert NOW.tzinfo is not None
