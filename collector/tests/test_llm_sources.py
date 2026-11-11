"""Offline tests for the LLM-backed sources: the Claude client is a fake."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from types import SimpleNamespace as NS

import httpx

from hackatlas import llm
from hackatlas.sources.base import Context
from hackatlas.sources.instagram import InstagramSource, load_posts
from hackatlas.sources.web import WebSource, queries

NOW = datetime(2026, 11, 12, 6, 0, tzinfo=UTC)


def rec(**kw) -> llm.ExtractedEvent:
    base = dict(
        is_hackathon=True,
        name="Örnek Hackathon",
        organizer="Örnek Kulüp",
        url=None,
        source_url="https://news.example.com/a",
        summary="Kısa özet.",
        format="in_person",
        city="İstanbul",
        country="tr",
        starts_on="2026-12-12",
        ends_on="2026-12-13",
        deadline="2026-11-29",
        prize_amount=50000,
        prize_currency="TRY",
        prize_text="50.000 TL",
        team_min=2,
        team_max=5,
        eligibility="Öğrenciler",
        themes=["ai", "nonsense"],
        confidence=0.8,
    )
    base.update(kw)
    return llm.ExtractedEvent(**base)


class FakeMessages:
    def __init__(self, create_responses=(), parse_outputs=()):
        self.create_responses = list(create_responses)
        self.parse_outputs = list(parse_outputs)
        self.create_calls: list[dict] = []
        self.parse_calls: list[dict] = []

    def create(self, **kw):
        self.create_calls.append(kw)
        return self.create_responses.pop(0)

    def parse(self, **kw):
        self.parse_calls.append(kw)
        out = self.parse_outputs.pop(0)
        return NS(stop_reason="end_turn", parsed_output=llm.Extraction(events=out))


class FakeClient:
    def __init__(self, **kw):
        self.messages = FakeMessages(**kw)


def ctx() -> Context:
    return Context(client=httpx.Client(), now=NOW)


def search_response(urls, text="Bulunan: Örnek Hackathon ...", stop="end_turn"):
    results = [NS(type="web_search_result", url=u) for u in urls]
    return NS(
        stop_reason=stop,
        content=[
            NS(type="web_search_tool_result", content=results),
            NS(type="text", text=text, citations=None),
        ],
    )


# --- to_event -------------------------------------------------------------------------------------------


def test_to_event_maps_fields():
    ev = llm.to_event(rec(), "web", NOW)
    assert ev is not None
    assert ev.id.endswith("-2026")
    assert ev.location.country == "TR"
    assert ev.prize.amount == 50000 and ev.prize.currency == "TRY"
    assert ev.team.min == 2 and ev.team.max == 5
    assert ev.themes == ["ai"]
    assert ev.url == "https://news.example.com/a"  # falls back to the source page
    assert ev.sources[0].kind == "web"
    assert ev.confidence == 0.8


def test_to_event_drops_non_hackathon_past_and_undated():
    assert llm.to_event(rec(is_hackathon=False), "web", NOW) is None
    assert (
        llm.to_event(rec(deadline="2026-10-01", starts_on="2026-10-05", ends_on="2026-10-06"), "web", NOW)
        is None
    )
    assert llm.to_event(rec(deadline=None, starts_on=None, ends_on=None), "web", NOW) is None


def test_to_event_ignores_bad_dates_and_clamps_summary():
    ev = llm.to_event(rec(deadline="31.12.2026", summary="x" * 400, confidence=1.7), "web", NOW)
    assert ev is not None
    assert ev.deadline is None  # unparseable, but the event dates still keep it upcoming
    assert len(ev.summary) <= 300
    assert ev.confidence == 1.0


# --- web source -----------------------------------------------------------------------------------------


def test_queries_use_turkish_months():
    qs = queries(NOW.date())
    assert any("Kasım 2026" in q for q in qs)
    assert any("Aralık 2026" in q for q in qs)
    assert any(q.startswith("site:instagram.com") for q in qs)


def test_web_source_keeps_only_seen_urls():
    client = FakeClient(
        create_responses=[search_response(["https://news.example.com/a/"])],
        parse_outputs=[[rec(), rec(name="Uydurma", source_url="https://not-seen.example.com/x")]],
    )
    events = WebSource(client=client, max_queries=1).fetch(ctx())
    assert [e.name for e in events] == ["Örnek Hackathon"]
    call = client.messages.create_calls[0]
    assert call["tools"][0]["name"] == "web_search"
    assert call["tools"][0]["user_location"]["country"] == "TR"


def test_web_source_resumes_pause_turn():
    client = FakeClient(
        create_responses=[
            search_response(["https://news.example.com/a"], text="", stop="pause_turn"),
            search_response([], text="Bulunan: Örnek Hackathon"),
        ],
        parse_outputs=[[rec()]],
    )
    events = WebSource(client=client, max_queries=1).fetch(ctx())
    assert len(events) == 1
    second = client.messages.create_calls[1]["messages"]
    assert second[-1]["role"] == "assistant"  # resumed without an extra user turn


def test_web_source_skips_without_credentials(monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE", "HACKATLAS_LLM"):
        monkeypatch.delenv(k, raising=False)
    assert WebSource().fetch(ctx()) == []


def test_web_source_survives_failing_query():
    class Boom(FakeClient):
        pass

    client = Boom()
    client.messages.create = lambda **kw: (_ for _ in ()).throw(RuntimeError("network"))
    assert WebSource(client=client, max_queries=2).fetch(ctx()) == []


# --- instagram source -----------------------------------------------------------------------------------


def write_export(tmp_path, rows):
    p = tmp_path / "hackathon.jsonl"
    p.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
    return p


def test_load_posts_filters_keyword_age_and_duplicates(tmp_path):
    p = write_export(
        tmp_path,
        [
            {
                "short_code": "AAA",
                "caption": "Yapay zekâ HACKATHON başvuruları açıldı",
                "timestamp": "2026-11-10T10:00:00.000Z",
                "owner_username": "kulup",
            },
            {"short_code": "AAA", "caption": "hackathon tekrar", "timestamp": "2026-11-10T10:00:00.000Z"},
            {"short_code": "BBB", "caption": "Maç günü!", "timestamp": "2026-11-10T10:00:00.000Z"},
            {"short_code": "CCC", "caption": "Datathon 2025", "timestamp": "2025-01-01T10:00:00.000Z"},
            {"shortCode": "DDD", "text": "Game Jam hafta sonu", "timestamp": "2026-11-01T10:00:00.000Z"},
            "not json",
        ],
    )
    posts = load_posts(p, NOW)
    assert [x["url"] for x in posts] == [
        "https://www.instagram.com/p/AAA/",
        "https://www.instagram.com/p/DDD/",
    ]


def test_instagram_source_extracts_with_post_urls(tmp_path):
    p = write_export(
        tmp_path,
        [
            {
                "short_code": "AAA",
                "caption": "Hackathon! Son başvuru 29 Kasım",
                "timestamp": "2026-11-10T10:00:00.000Z",
                "owner_username": "kulup",
            },
        ],
    )
    client = FakeClient(
        parse_outputs=[
            [
                rec(source_url="https://www.instagram.com/p/AAA/"),
                rec(name="Başka", source_url="https://www.instagram.com/p/ZZZ/"),
            ]
        ]
    )
    events = InstagramSource(client=client, path=str(p)).fetch(ctx())
    assert [e.name for e in events] == ["Örnek Hackathon"]
    assert events[0].sources[0].kind == "instagram"
    prompt = client.messages.parse_calls[0]["messages"][0]["content"]
    assert "https://www.instagram.com/p/AAA/" in prompt and "@kulup" in prompt


def test_instagram_source_without_file_does_nothing(monkeypatch):
    monkeypatch.delenv("HACKATLAS_IG_EXPORT", raising=False)
    assert InstagramSource(client=FakeClient()).fetch(ctx()) == []
