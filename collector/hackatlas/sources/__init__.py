"""Source registry: name -> module path. Modules are imported lazily."""

from __future__ import annotations

import importlib

SOURCES: dict[str, str] = {
    "devpost": "hackatlas.sources.devpost",
    "mlh": "hackatlas.sources.mlh",
    "devfolio": "hackatlas.sources.devfolio",
    "techcareer": "hackatlas.sources.techcareer",
    "web": "hackatlas.sources.web",
    "instagram": "hackatlas.sources.instagram",
}


def load(name: str):
    """Return an instance of the named source.

    Raises KeyError for unknown names and ImportError with a clear message when the module
    is missing (for example the web or instagram source before it is installed).
    """
    if name not in SOURCES:
        raise KeyError(f"unknown source {name!r}; known: {', '.join(SOURCES)}")
    path = SOURCES[name]
    try:
        module = importlib.import_module(path)
    except ModuleNotFoundError as exc:
        if exc.name == path:
            raise ImportError(f"source {name!r} is not available: module {path} is missing") from exc
        raise ImportError(f"source {name!r} needs a missing dependency: {exc.name}") from exc
    cls = getattr(module, "Source", None)
    if cls is None:
        raise ImportError(f"source module {path} defines no Source class")
    return cls()
