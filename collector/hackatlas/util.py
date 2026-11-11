"""Shared helpers: slugs, theme mapping, prize parsing, polite HTTP."""

from __future__ import annotations

import html
import logging
import re
import time
import unicodedata
from datetime import UTC, date, datetime

import httpx

from hackatlas.model import Prize

log = logging.getLogger("hackatlas")

USER_AGENT = "hackatlas/0.1 (+https://github.com/msgenan/hackatlas)"
TIMEOUT = 20.0
MIN_INTERVAL = 1.0  # seconds between requests to the same source

_TR_MAP = str.maketrans(
    {
        "ç": "c",
        "Ç": "c",
        "ğ": "g",
        "Ğ": "g",
        "ı": "i",
        "İ": "i",
        "ö": "o",
        "Ö": "o",
        "ş": "s",
        "Ş": "s",
        "ü": "u",
        "Ü": "u",
    }
)


def fold_turkish(text: str) -> str:
    """Lower-case text with Turkish letters mapped to ASCII and other accents stripped."""
    text = text.translate(_TR_MAP).lower()
    text = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def slugify(text: str, max_len: int | None = None) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", fold_turkish(text)).strip("-")
    if max_len and len(slug) > max_len:
        cut = slug[:max_len]
        # cut on a word boundary unless the slug is one huge word
        slug = cut.rsplit("-", 1)[0] if "-" in cut and slug[max_len] != "-" else cut
        slug = slug.strip("-")
    return slug


def make_id(name: str, year: int) -> str:
    slug = slugify(name, max_len=80) or "hackathon"
    if slug == str(year) or slug.endswith(f"-{year}"):
        return slug
    return f"{slug}-{year}"


# --- themes -----------------------------------------------------------------

_THEME_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "ai",
        (
            "machine learning",
            "artificial intelligence",
            "llm",
            "generative",
            "genai",
            "yapay zeka",
            "ai",
            "ml",
        ),
    ),
    ("web3", ("blockchain", "crypto", "web3", "defi", "nft", "ethereum")),
    ("fintech", ("fintech", "finance", "financial", "banking")),
    ("health", ("health", "healthcare", "healthtech", "medical", "saglik")),
    (
        "sustainability",
        ("sustainability", "climate", "environment", "cleantech", "green", "surdurulebilirlik"),
    ),
    ("education", ("education", "edtech", "learning", "egitim")),
    ("games", ("gaming", "game", "games", "oyun")),
    ("mobility", ("mobility", "transport", "transportation", "automotive")),
    ("security", ("cybersecurity", "security", "siber guvenlik")),
    ("social-impact", ("social good", "social impact", "nonprofit", "civic")),
    ("hardware", ("hardware", "iot", "robotics", "embedded", "ar/vr", "vr")),
    ("open", ("open ended", "open-ended", "beginner friendly", "no restrictions", "open innovation", "open")),
)


def map_themes(tags: list[str]) -> list[str]:
    """Map free-form tags onto model.THEMES; unknown tags are dropped, order follows the input."""
    out: list[str] = []
    for tag in tags:
        low = fold_turkish(tag).strip()
        tokens = set(re.findall(r"[a-z0-9]+", low))
        for theme, keys in _THEME_RULES:
            if any(k in tokens if len(k) <= 3 else k in low for k in keys):
                if theme not in out:
                    out.append(theme)
                break
    return out


# --- prize ------------------------------------------------------------------

_CURRENCIES: tuple[tuple[str, str], ...] = (
    (r"\bCAD\b|\bC\$|\$\s?CAD", "CAD"),
    (r"\bAUD\b|\bA\$|\$\s?AUD", "AUD"),
    (r"\$|\bUSD\b|\bUS\$", "USD"),
    (r"€|\bEUR\b|\beuro?s?\b", "EUR"),
    (r"£|\bGBP\b", "GBP"),
    (r"₺|\bTRY\b|\bTL\b|\blira\b", "TRY"),
    (r"₹|\bINR\b|\bRs\.?(?=\s|\d)", "INR"),
)
_NUM = re.compile(r"\d[\d.,]*\d|\d")
_SCALE = re.compile(r"\s*(k\b|m\b|million\b|milyon\b|bin\b)", re.I)


def _to_number(raw: str, currency: str | None) -> float | None:
    dots, commas = raw.count("."), raw.count(",")
    if dots and commas:
        dec = "." if raw.rfind(".") > raw.rfind(",") else ","
        thou = "," if dec == "." else "."
        clean = raw.replace(thou, "").replace(dec, ".")
        # Indian grouping 1,00,000.50 is covered: only the last separator is decimal
    elif dots or commas:
        sep = "." if dots else ","
        count = max(dots, commas)
        tail = raw.rsplit(sep, 1)[1]
        if count > 1 or len(tail) == 3:
            clean = raw.replace(sep, "")  # thousands separator(s)
        elif sep == "," and currency == "TRY":
            clean = raw.replace(",", ".")
        else:
            clean = raw.replace(sep, ".") if len(tail) <= 2 else raw.replace(sep, "")
    else:
        clean = raw
    try:
        return float(clean)
    except ValueError:
        return None


def parse_prize(text: str | None) -> Prize | None:
    """Parse '$10,000', '€15.000', '50.000 TL', '₺50.000', 'USD 3,000' into a Prize.

    Turkish convention applies: '.' is the thousands separator. Returns None for empty/zero prizes.
    """
    if not text:
        return None
    clean = html.unescape(re.sub(r"<[^>]+>", "", text))
    clean = re.sub(r"\s+", " ", clean).strip()
    if not clean:
        return None
    currency = next(
        (code for pat, code in _CURRENCIES if re.search(pat, clean, re.I if code != "TRY" else 0)), None
    )
    m = _NUM.search(clean)
    if not m:
        return Prize(text=clean[:120])
    amount = _to_number(m.group(0), currency)
    scale = _SCALE.match(clean, m.end())
    if amount is not None and scale:
        amount *= 1_000_000 if scale.group(1).lower() in ("m", "million", "milyon") else 1000
    if not amount:
        return None
    return Prize(amount=amount, currency=currency, text=clean[:120])


# --- countries --------------------------------------------------------------

_COUNTRIES = {
    "turkey": "TR",
    "turkiye": "TR",
    "united states": "US",
    "usa": "US",
    "us": "US",
    "united kingdom": "GB",
    "uk": "GB",
    "england": "GB",
    "india": "IN",
    "germany": "DE",
    "france": "FR",
    "spain": "ES",
    "italy": "IT",
    "netherlands": "NL",
    "canada": "CA",
    "australia": "AU",
    "brazil": "BR",
    "mexico": "MX",
    "japan": "JP",
    "china": "CN",
    "singapore": "SG",
    "thailand": "TH",
    "indonesia": "ID",
    "malaysia": "MY",
    "vietnam": "VN",
    "philippines": "PH",
    "pakistan": "PK",
    "bangladesh": "BD",
    "sri lanka": "LK",
    "nepal": "NP",
    "united arab emirates": "AE",
    "uae": "AE",
    "saudi arabia": "SA",
    "israel": "IL",
    "egypt": "EG",
    "nigeria": "NG",
    "kenya": "KE",
    "south africa": "ZA",
    "ghana": "GH",
    "poland": "PL",
    "romania": "RO",
    "finland": "FI",
    "sweden": "SE",
    "norway": "NO",
    "denmark": "DK",
    "ireland": "IE",
    "portugal": "PT",
    "switzerland": "CH",
    "austria": "AT",
    "belgium": "BE",
    "czechia": "CZ",
    "czech republic": "CZ",
    "greece": "GR",
    "hungary": "HU",
    "ukraine": "UA",
    "argentina": "AR",
    "chile": "CL",
    "colombia": "CO",
    "peru": "PE",
    "south korea": "KR",
    "korea": "KR",
    "taiwan": "TW",
    "hong kong": "HK",
    "new zealand": "NZ",
    "estonia": "EE",
    "lithuania": "LT",
    "latvia": "LV",
    "bulgaria": "BG",
    "serbia": "RS",
    "croatia": "HR",
    "slovenia": "SI",
    "slovakia": "SK",
    "morocco": "MA",
    "tunisia": "TN",
    "uzbekistan": "UZ",
    "kazakhstan": "KZ",
    "azerbaijan": "AZ",
    "georgia": "GE",
    "armenia": "AM",
    "cyprus": "CY",
}


def country_code(name: str | None) -> str | None:
    """ISO alpha-2 from a country name (English or Turkish spelling) or an existing 2-letter code."""
    if not name:
        return None
    key = fold_turkish(name).strip(" .")
    if len(key) == 2 and key.isalpha():
        return key.upper()
    return _COUNTRIES.get(key)


# --- HTTP -------------------------------------------------------------------

_last_request: dict[str, float] = {}
_sleep = time.sleep
_clock = time.monotonic


def new_client() -> httpx.Client:
    return httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT, follow_redirects=True)


def http_request(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    source: str | None = None,
    tries: int = 2,
    **kwargs,
) -> httpx.Response:
    """One request with a 1 req/s limit per source, a 20 s timeout and a retry on 5xx.

    Raises httpx.HTTPError for network errors and 4xx/5xx after the last try.
    """
    key = source or httpx.URL(url).host
    headers = {"User-Agent": USER_AGENT, **kwargs.pop("headers", {})}
    kwargs.setdefault("timeout", TIMEOUT)
    last_exc: Exception | None = None
    for attempt in range(tries):
        wait = _last_request.get(key, -1e9) + MIN_INTERVAL - _clock()
        if wait > 0:
            _sleep(wait)
        _last_request[key] = _clock()
        try:
            resp = client.request(method, url, headers=headers, **kwargs)
            if resp.status_code >= 500 and attempt < tries - 1:
                continue
            resp.raise_for_status()
            return resp
        except httpx.TransportError as exc:
            last_exc = exc
            if attempt >= tries - 1:
                raise
    raise last_exc or RuntimeError("unreachable")


def http_get(client: httpx.Client, url: str, *, source: str | None = None, **kwargs) -> httpx.Response:
    return http_request(client, "GET", url, source=source, **kwargs)


def http_post(client: httpx.Client, url: str, *, source: str | None = None, **kwargs) -> httpx.Response:
    return http_request(client, "POST", url, source=source, **kwargs)


# --- small shared bits for sources -----------------------------------------


def upcoming(ctx_now: datetime, *dates: date | None) -> bool:
    """True when the first given date (deadline, else end) is today or later (UTC date of ctx_now)."""
    for d in dates:
        if d is not None:
            return d >= ctx_now.astimezone(UTC).date()
    return False
