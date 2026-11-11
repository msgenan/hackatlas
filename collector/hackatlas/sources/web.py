"""Web and social search source: Claude web search over news, university/teknopark pages and public
Instagram / LinkedIn / X posts, then structured extraction. Skipped when no API credentials are set."""

from __future__ import annotations

import logging
import os
from datetime import date

from hackatlas import llm
from hackatlas.model import Event
from hackatlas.sources.base import Context

log = logging.getLogger(__name__)

MONTHS_TR = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
]


def queries(today: date) -> list[str]:
    this_m = MONTHS_TR[today.month - 1]
    next_m = MONTHS_TR[today.month % 12]
    y = today.year
    return [
        f"hackathon {this_m} {y} başvuru ödül",
        f"hackathon {next_m} {y} başvurular başladı",
        f"yapay zeka hackathonu {y} başvuru",
        f"datathon OR ideathon {y} başvuru ödül",
        f"site:instagram.com hackathon başvuru {y}",
        f"site:linkedin.com/posts hackathon başvuru {y}",
        f"site:x.com hackathon başvuru {y}",
        f"teknopark hackathon {y} son başvuru",
    ]


class WebSource:
    name = "web"

    def __init__(self, client=None, max_queries: int | None = None):
        self._client = client
        self.max_queries = max_queries or int(os.environ.get("HACKATLAS_WEB_MAX_QUERIES", "8"))

    def fetch(self, ctx: Context) -> list[Event]:
        if self._client is None and not llm.has_credentials():
            log.warning("web: no Anthropic credentials, skipped")
            return []
        client = self._client or llm.make_client()
        today = ctx.now.date()
        out: list[Event] = []
        for q in queries(today)[: self.max_queries]:
            try:
                text, urls = llm.search(client, q, today)
                if not text or not urls:
                    continue
                for x in llm.extract(client, text, today, urls):
                    ev = llm.to_event(x, "web", ctx.now)
                    if ev:
                        out.append(ev)
            except Exception as e:  # one failing query must not stop the run
                log.warning("web: query %r failed: %s", q, e)
        return out


Source = WebSource
