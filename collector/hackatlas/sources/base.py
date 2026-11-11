"""Interface every source module implements."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol

import httpx

from hackatlas.model import Event


@dataclass
class Context:
    """What a source gets for one run."""

    client: httpx.Client
    now: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class Source(Protocol):
    name: str  # equals a SourceKind value

    def fetch(self, ctx: Context) -> list[Event]:
        """Return upcoming or open events, already in the Event contract. Must not raise for one bad item."""
        ...
