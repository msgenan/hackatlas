"""hackatlas command line: collect, review, approve, reject, pr-body, schema."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from hackatlas import store
from hackatlas.merge import merge_candidates
from hackatlas.model import Event, EventFile, Rejected
from hackatlas.sources import SOURCES, load
from hackatlas.sources.base import Context
from hackatlas.util import new_client

DEFAULT_SOURCES = "devpost,mlh,devfolio,techcareer"
FORMATS = {"online": "Online", "in_person": "Yerinde", "hybrid": "Hibrit"}
MISSING = "Belirtilmemiş"
LOW_CONFIDENCE = 0.7


# --- formatting -------------------------------------------------------------


def _fmt_dates(e: Event) -> str:
    if e.starts_on and e.ends_on and e.starts_on != e.ends_on:
        return f"{e.starts_on.isoformat()} - {e.ends_on.isoformat()}"
    d = e.starts_on or e.ends_on
    return d.isoformat() if d else MISSING


def _fmt_place(e: Event) -> str:
    parts = []
    if e.format:
        parts.append(FORMATS[e.format])
    if e.location:
        place = ", ".join(x for x in (e.location.venue, e.location.city, e.location.country) if x)
        if place:
            parts.append(place)
    return " / ".join(parts) or MISSING


def _fmt_prize(e: Event) -> str:
    if not e.prize:
        return MISSING
    if e.prize.text:
        return e.prize.text
    if e.prize.amount is not None:
        return f"{e.prize.amount:,.0f} {e.prize.currency or ''}".strip()
    return MISSING


def _fmt_team(e: Event) -> str:
    t = e.team
    if not t or (t.min is None and t.max is None):
        return MISSING
    if t.min is not None and t.max is not None:
        return f"{t.min}-{t.max} kişi" if t.min != t.max else f"{t.min} kişi"
    return f"en az {t.min} kişi" if t.min is not None else f"en fazla {t.max} kişi"


def describe(e: Event) -> str:
    rows = [
        ("Ad", e.name),
        ("Son başvuru", e.deadline.isoformat() if e.deadline else MISSING),
        ("Tarihler", _fmt_dates(e)),
        ("Format / yer", _fmt_place(e)),
        ("Ödül", _fmt_prize(e)),
        ("Takım", _fmt_team(e)),
        ("Kimler katılabilir", e.eligibility or MISSING),
        ("Organizatör", e.organizer or MISSING),
        ("Bağlantı", e.url),
        ("Kaynaklar", ", ".join(f"{s.kind} ({s.url})" for s in e.sources)),
        ("Güven", f"{e.confidence:.2f}" if e.confidence is not None else "-"),
    ]
    return f"[{e.id}]\n" + "\n".join(f"  {k + ':':<20}{v}" for k, v in rows)


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def pr_body(events: list[Event]) -> str:
    lines = [f"{len(events)} yeni hackathon adayı bulundu.", ""]
    lines += [
        "| Ad | Son başvuru | Tarihler | Yer | Ödül | Kaynak |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for e in events:
        flag = " (kontrol et)" if e.confidence is not None and e.confidence < LOW_CONFIDENCE else ""
        src = e.sources[0]
        cells = [
            _cell(e.name) + flag,
            e.deadline.isoformat() if e.deadline else MISSING,
            _fmt_dates(e),
            _cell(_fmt_place(e)),
            _cell(_fmt_prize(e)),
            f"[{src.kind}]({src.url})",
        ]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


# --- commands ---------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def cmd_collect(args) -> int:
    data = Path(args.data)
    approved, pending, rejected = store.load_events(data), store.load_pending(data), store.load_rejected(data)
    names = [n.strip() for n in args.sources.split(",") if n.strip()]
    ctx = Context(client=new_client(), now=_now())
    candidates: list[Event] = []
    for name in names:
        if name == "web" and not os.environ.get("ANTHROPIC_API_KEY"):
            print("web: skipped (ANTHROPIC_API_KEY is empty)")
            continue
        try:
            source = load(name)
        except (KeyError, ImportError) as exc:
            print(f"{name}: skipped ({exc})")
            continue
        try:
            found = source.fetch(ctx)
        except Exception as exc:  # a source must not take the whole run down
            print(f"{name}: failed ({exc})")
            continue
        print(f"{name}: {len(found)} upcoming events")
        candidates += found
    summary = merge_candidates(candidates, approved, pending, rejected)
    print(f"merge: {summary}; pending now {len(pending.events)}")
    if args.dry_run:
        print("dry run: nothing written")
        return 0
    store.save_pending(data, pending)
    store.save_events(data, approved)  # approved may have gained sources or filled fields
    return 0


def _approve(data: Path, ids: list[str]) -> int:
    pending, approved = store.load_pending(data), store.load_events(data)
    wanted = set(ids)
    missing = wanted - {e.id for e in pending.events}
    if missing:
        print(f"not in pending: {', '.join(sorted(missing))}", file=sys.stderr)
    have = {e.id for e in approved.events}
    moved = 0
    for e in [e for e in pending.events if e.id in wanted]:
        if e.id not in have:
            approved.events.append(e)
            moved += 1
    pending.events = [e for e in pending.events if e.id not in wanted]
    store.save_events(data, approved)
    store.save_pending(data, pending)
    print(f"approved {moved}")
    return 1 if missing else 0


def _reject(data: Path, event_id: str, reason: str | None) -> int:
    pending, rejected = store.load_pending(data), store.load_rejected(data)
    if event_id not in {e.id for e in pending.events}:
        print(f"not in pending: {event_id}", file=sys.stderr)
        return 1
    pending.events = [e for e in pending.events if e.id != event_id]
    if event_id not in {r.id for r in rejected.rejected}:
        rejected.rejected.append(Rejected(id=event_id, reason=reason or None, rejected_at=_now()))
    store.save_pending(data, pending)
    store.save_rejected(data, rejected)
    print(f"rejected {event_id}")
    return 0


def cmd_approve(args) -> int:
    data = Path(args.data)
    if args.all:
        ids = [e.id for e in store.load_pending(data).events]
    elif args.ids:
        ids = args.ids
    else:
        print("give --all or at least one ID", file=sys.stderr)
        return 2
    return _approve(data, ids)


def cmd_reject(args) -> int:
    return _reject(Path(args.data), args.id, args.reason)


def cmd_review(args) -> int:
    data = Path(args.data)
    pending = store.load_pending(data)
    if not pending.events:
        print("no pending events")
        return 0
    total = len(pending.events)
    for i, e in enumerate(list(pending.events), 1):
        print(f"\n({i}/{total})")
        print(describe(e))
        while True:
            try:
                choice = input("[a]pprove / [r]eject / [s]kip / [q]uit: ").strip().lower()
            except EOFError:
                return 0
            if choice in ("a", "approve"):
                _approve(data, [e.id])
            elif choice in ("r", "reject"):
                _reject(data, e.id, input("reason: ").strip() or None)
            elif choice in ("s", "skip", ""):
                pass
            elif choice in ("q", "quit"):
                return 0
            else:
                continue
            break
    return 0


def cmd_pr_body(args) -> int:
    events = store.load_pending(Path(args.data)).events
    if args.count:
        print(len(events))
    elif events:
        sys.stdout.write(pr_body(sorted(events, key=store.sort_key)))
    return 0


def cmd_schema(args) -> int:
    out = Path(args.out) if args.out else store.repo_root() / "schema" / "event-file.schema.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(EventFile.model_json_schema(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="hackatlas", description="Collect and review hackathon listings.")
    parser.add_argument("-v", "--verbose", action="store_true", help="log source warnings")
    sub = parser.add_subparsers(dest="command", required=True)

    def add(name: str, func, help_: str) -> argparse.ArgumentParser:
        p = sub.add_parser(name, help=help_)
        p.add_argument(
            "--data", default=str(store.default_data_dir()), help="data directory (default: repo data/)"
        )
        p.set_defaults(func=func)
        return p

    p = add("collect", cmd_collect, "fetch sources and add candidates to pending.json")
    p.add_argument("--sources", default=DEFAULT_SOURCES, help=f"comma list of: {', '.join(SOURCES)}")
    p.add_argument("--dry-run", action="store_true", help="do not write files")
    add("review", cmd_review, "approve or reject pending events interactively")
    p = add("approve", cmd_approve, "move pending events to events.json")
    p.add_argument("--all", action="store_true")
    p.add_argument("ids", nargs="*", metavar="ID")
    p = add("reject", cmd_reject, "move a pending event to rejected.json")
    p.add_argument("id")
    p.add_argument("--reason")
    p = add("pr-body", cmd_pr_body, "print a Markdown PR body for the pending events")
    p.add_argument("--count", action="store_true", help="print only the number of pending events")
    p = add("schema", cmd_schema, "write the JSON schema of the event file")
    p.add_argument("--out", help="output path (default: schema/event-file.schema.json)")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.WARNING if args.verbose else logging.ERROR, format="%(name)s: %(message)s"
    )
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
