import httpx
import pytest
import respx

from hackatlas import util
from hackatlas.model import THEMES
from hackatlas.util import http_get, make_id, map_themes, parse_prize, slugify


def test_slugify_turkish_letters():
    assert slugify("Çağrı Işık Öğüt Şeker Ünal İstanbul") == "cagri-isik-ogut-seker-unal-istanbul"
    assert slugify("İZMİR  Hackathon!") == "izmir-hackathon"


def test_make_id_and_length():
    assert make_id("Yapay Zekâ Hackathonu", 2026) == "yapay-zeka-hackathonu-2026"
    assert make_id("Kiroween 2026", 2026) == "kiroween-2026"
    long = make_id("word " * 40, 2027)
    assert long.endswith("-2027") and len(long) <= 86
    assert "wor-" not in long  # cut on a word boundary


@pytest.mark.parametrize(
    ("text", "amount", "currency"),
    [
        ("$10,000", 10000, "USD"),
        ("€15.000", 15000, "EUR"),
        ("50.000 TL", 50000, "TRY"),
        ("₺50.000", 50000, "TRY"),
        ("USD 3,000", 3000, "USD"),
        ("$<span data-currency-value>67,500</span>", 67500, "USD"),
        ("1.250.000 TL", 1250000, "TRY"),
        ("10.000,50 TL", 10000.5, "TRY"),
        ("$CAD 10,000 in cash", 10000, "CAD"),
        ("₹10,00,000", 1000000, "INR"),
        ("$12.5k", 12500, "USD"),
        ("1,5 milyon TL", 1500000, "TRY"),
    ],
)
def test_parse_prize(text, amount, currency):
    prize = parse_prize(text)
    assert prize is not None
    assert prize.amount == amount
    assert prize.currency == currency


def test_parse_prize_empty_and_text_only():
    assert parse_prize(None) is None
    assert parse_prize("") is None
    assert parse_prize("$0") is None
    only_text = parse_prize("Para Ödülü")
    assert only_text is not None and only_text.amount is None and only_text.text == "Para Ödülü"


def test_map_themes():
    tags = [
        "Machine Learning/AI",
        "LLM",
        "Blockchain",
        "Fintech",
        "Healthcare",
        "Climate",
        "Education",
        "Game",
        "Transport",
        "Security",
        "Social Good",
        "IoT",
        "Open Ended",
        "Web",
        "Productivity",
    ]
    out = map_themes(tags)
    assert out == [
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
    ]
    assert set(out) <= set(THEMES)


@respx.mock
def test_http_get_sends_user_agent_and_retries_5xx():
    route = respx.get("https://example.com/x").mock(
        side_effect=[httpx.Response(503), httpx.Response(200, json={"ok": True})]
    )
    with httpx.Client() as client:
        resp = http_get(client, "https://example.com/x", source="t")
    assert resp.json() == {"ok": True}
    assert route.call_count == 2
    assert route.calls.last.request.headers["user-agent"].startswith("hackatlas/0.1")


@respx.mock
def test_http_get_gives_up_after_two_tries():
    route = respx.get("https://example.com/y").mock(return_value=httpx.Response(500))
    with httpx.Client() as client, pytest.raises(httpx.HTTPStatusError):
        http_get(client, "https://example.com/y", source="t")
    assert route.call_count == 2


@respx.mock
def test_http_get_rate_limits_per_source(monkeypatch):
    sleeps: list[float] = []
    clock = [100.0]
    monkeypatch.setattr(util, "_clock", lambda: clock[0])
    monkeypatch.setattr(util, "_sleep", sleeps.append)
    respx.get("https://example.com/z").mock(return_value=httpx.Response(200))
    with httpx.Client() as client:
        http_get(client, "https://example.com/z", source="s1")
        http_get(client, "https://example.com/z", source="s1")
        http_get(client, "https://example.com/z", source="s2")
    assert len(sleeps) == 1 and 0 < sleeps[0] <= 1.0
