import json
from datetime import UTC, datetime

from hackatlas import store
from hackatlas.merge import dedup_key, key_from_id, merge_candidates, normalize_name
from hackatlas.model import EventFile, Location, Prize, Rejected, RejectedFile, SourceRef

from .conftest import NOW, make_event

LATER = datetime(2026, 11, 13, 12, 0, tzinfo=UTC)


def test_normalize_name():
    assert normalize_name("Hack İstanbul 2026") == normalize_name("HACK ISTANBUL")
    assert normalize_name("DSH Hacks V2") == normalize_name("DSH Hacks")
    assert normalize_name("Hackfest 8th Edition") == normalize_name("Hackfest")
    assert normalize_name("Hacksprint 3.0!") == "hacksprint"
    assert normalize_name("Yapay Zekâ Hackathonu") == "yapay zeka hackathonu"  # 'hackathon' is kept


def test_key_uses_start_year_then_deadline_year():
    a = make_event("Foo Hack", starts_on="2027-01-10")
    b = make_event("Foo Hack", starts_on=None, deadline="2027-01-02")
    assert dedup_key(a) == dedup_key(b) == "foo hack|2027"
    assert key_from_id("foo-hack-2027") == "foo hack|2027"


def test_rejected_candidates_are_dropped():
    pending = EventFile()
    rejected = RejectedFile(rejected=[Rejected(id="foo-hack-2026", rejected_at=NOW)])
    cands = [make_event("Foo Hack"), make_event("FOO HACK 2026", starts_on="2026-12-11")]
    summary = merge_candidates(cands, EventFile(), pending, rejected)
    assert (summary.new, summary.updated, summary.skipped) == (0, 0, 2)
    assert pending.events == []


def test_approved_match_fills_only_null_fields_and_adds_source():
    approved_ev = make_event("Foo Hack", organizer="Real Org", prize=Prize(amount=100, currency="USD"))
    approved = EventFile(events=[approved_ev])
    cand = make_event(
        "Foo Hack 2026",
        organizer="Other Org",
        prize=Prize(amount=999, currency="EUR", text="999"),
        location=Location(city="Ankara", country="TR"),
        eligibility="Students",
        sources=[SourceRef(kind="mlh", url="https://mlh.io/foo", seen_at=LATER)],
        updated_at=LATER,
    )
    pending = EventFile()
    summary = merge_candidates([cand], approved, pending, RejectedFile())
    assert (summary.new, summary.updated, summary.skipped) == (0, 1, 0)
    assert pending.events == []
    merged = approved.events[0]
    assert merged.organizer == "Real Org"  # never overwritten
    assert merged.prize.amount == 100 and merged.prize.currency == "USD"
    assert merged.prize.text == "999"  # null sub-field filled
    assert merged.location.city == "Ankara" and merged.eligibility == "Students"
    assert [s.kind for s in merged.sources] == ["devpost", "mlh"]
    assert merged.updated_at == LATER


def test_no_change_keeps_updated_at():
    ev = make_event("Foo Hack")
    approved = EventFile(events=[ev])
    cand = make_event("Foo Hack", updated_at=LATER)  # same source url, nothing new
    summary = merge_candidates([cand], approved, EventFile(), RejectedFile())
    assert summary.updated == 0
    assert approved.events[0].updated_at == NOW


def test_pending_match_merges_into_pending():
    pending = EventFile(events=[make_event("Bar Hack")])
    cand = make_event(
        "Bar Hack",
        organizer="Bar Inc",
        sources=[SourceRef(kind="devfolio", url="https://bar.devfolio.co/", seen_at=LATER)],
        updated_at=LATER,
    )
    summary = merge_candidates([cand], EventFile(), pending, RejectedFile())
    assert (summary.new, summary.updated) == (0, 1)
    assert len(pending.events) == 1
    assert pending.events[0].organizer == "Bar Inc" and len(pending.events[0].sources) == 2


def test_new_candidate_goes_to_pending_and_duplicates_collapse():
    pending = EventFile()
    a = make_event("Baz Hack")
    b = make_event("Baz Hack V2", sources=[SourceRef(kind="mlh", url="https://mlh.io/baz", seen_at=NOW)])
    c = make_event("Qux Hack")
    summary = merge_candidates([a, b, c], EventFile(), pending, RejectedFile())
    assert (summary.new, summary.updated, summary.skipped) == (2, 1, 0)
    assert {e.id for e in pending.events} == {"baz-hack-2026", "qux-hack-2026"}


def test_store_sorts_and_writes_stable_json(tmp_path):
    events = [
        make_event("Zed", deadline=None, starts_on=None),
        make_event("Beta", deadline="2026-12-01", starts_on="2026-12-20"),
        make_event("Alpha", deadline="2026-12-01", starts_on="2026-12-10"),
        make_event("Early", deadline="2026-11-20", starts_on="2027-01-01"),
        make_event("Çağrı Hack", deadline="2026-12-01", starts_on="2026-12-10"),
    ]
    store.save_events(tmp_path, EventFile(events=events))
    raw = (tmp_path / "events.json").read_text(encoding="utf-8")
    assert raw.endswith("}\n") and not raw.endswith("\n\n")
    assert "Çağrı" in raw  # ensure_ascii off
    assert raw.startswith('{\n  "events": [')  # indent 2
    ids = [e["id"] for e in json.loads(raw)["events"]]
    assert ids == ["early-2026", "alpha-2026", "cagri-hack-2026", "beta-2026", "zed-2026"]
    # saving again in another order is byte-identical
    store.save_events(tmp_path, EventFile(events=list(reversed(events))))
    assert (tmp_path / "events.json").read_text(encoding="utf-8") == raw
    assert not list(tmp_path.glob("*.tmp"))
    assert len(store.load_events(tmp_path).events) == 5


def test_store_missing_files_are_empty(tmp_path):
    assert store.load_events(tmp_path).events == []
    assert store.load_pending(tmp_path).events == []
    assert store.load_rejected(tmp_path).rejected == []
