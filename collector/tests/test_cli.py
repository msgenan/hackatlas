import json

import pytest

from hackatlas import store
from hackatlas.cli import main
from hackatlas.model import EventFile, Prize

from .conftest import make_event


@pytest.fixture
def data(tmp_path):
    pending = EventFile(
        events=[
            make_event(
                "Alpha Hack",
                deadline="2026-12-01",
                prize=Prize(amount=50000, currency="TRY", text="50.000 TL"),
            ),
            make_event("Beta | Hack", deadline="2026-12-05", confidence=0.5),
            make_event("Gamma Hack", deadline="2026-12-09", confidence=0.9),
        ]
    )
    store.save_pending(tmp_path, pending)
    return tmp_path


def test_approve_ids_moves_events(data):
    assert main(["approve", "alpha-hack-2026", "--data", str(data)]) == 0
    assert [e.id for e in store.load_events(data).events] == ["alpha-hack-2026"]
    assert [e.id for e in store.load_pending(data).events] == ["beta-hack-2026", "gamma-hack-2026"]


def test_approve_all_and_unknown_id(data, capsys):
    assert main(["approve", "nope-2026", "--data", str(data)]) == 1
    assert "not in pending" in capsys.readouterr().err
    assert main(["approve", "--all", "--data", str(data)]) == 0
    assert len(store.load_events(data).events) == 3
    assert store.load_pending(data).events == []
    assert json.loads((data / "pending.json").read_text()) == {"events": []}


def test_reject_records_reason(data):
    assert main(["reject", "beta-hack-2026", "--reason", "not a hackathon", "--data", str(data)]) == 0
    rejected = store.load_rejected(data).rejected
    assert [(r.id, r.reason) for r in rejected] == [("beta-hack-2026", "not a hackathon")]
    assert "beta-hack-2026" not in {e.id for e in store.load_pending(data).events}


def test_pr_body_table_and_flags(data, capsys):
    assert main(["pr-body", "--data", str(data)]) == 0
    out = capsys.readouterr().out
    lines = out.strip().splitlines()
    assert lines[0].startswith("3 ")
    rows = [line for line in lines if line.startswith("| ") and "---" not in line][1:]
    assert len(rows) == 3
    assert "50.000 TL" in rows[0] and "[devpost](<https://devpost.com/alpha-hack-2026>)" in rows[0]
    assert "(kontrol et)" in rows[1] and "Beta \\| Hack" in rows[1]
    assert "(kontrol et)" not in rows[0] and "(kontrol et)" not in rows[2]
    assert "Belirtilmemiş" in rows[2]


def test_pr_body_empty_and_count(tmp_path, capsys):
    assert main(["pr-body", "--data", str(tmp_path)]) == 0
    assert capsys.readouterr().out == ""
    assert main(["pr-body", "--count", "--data", str(tmp_path)]) == 0
    assert capsys.readouterr().out.strip() == "0"


def test_review_flow(data, monkeypatch, capsys):
    answers = iter(["a", "r", "too vague", "q"])
    monkeypatch.setattr("builtins.input", lambda prompt="": next(answers))
    assert main(["review", "--data", str(data)]) == 0
    out = capsys.readouterr().out
    first_fields = [line.split(":")[0].strip() for line in out.split("(2/3)")[0].splitlines()[3:]]
    assert first_fields[:6] == ["Ad", "Son başvuru", "Tarihler", "Format / yer", "Ödül", "Takım"]
    assert [e.id for e in store.load_events(data).events] == ["alpha-hack-2026"]
    assert [r.reason for r in store.load_rejected(data).rejected] == ["too vague"]
    assert [e.id for e in store.load_pending(data).events] == ["gamma-hack-2026"]


def test_schema_command(tmp_path):
    out = tmp_path / "s" / "event-file.schema.json"
    assert main(["schema", "--out", str(out)]) == 0
    assert "Event" in json.loads(out.read_text())["$defs"]


def test_collect_dry_run_with_missing_sources(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert main(["collect", "--sources", "web,ghost", "--dry-run", "--data", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "web: skipped" in out and "ghost: skipped" in out
    assert not (tmp_path / "pending.json").exists()


def test_pr_body_escapes_markdown_and_rejects_odd_urls():
    from datetime import UTC, datetime

    from hackatlas.cli import pr_body
    from hackatlas.model import Event, SourceRef

    now = datetime(2026, 11, 12, tzinfo=UTC)
    ev = Event(
        id="x-2026", name="Evil [click](https://evil.example) **bold**\n| row", url="https://ok.example",
        # model_construct skips validation: the model already refuses this URL, the PR body is a second layer
        sources=[SourceRef.model_construct(kind="web", url="https://a.example/x)\n[pwn](https://evil.example",
                                           seen_at=now)],
        added_at=now, updated_at=now,
    )
    body = pr_body([ev])
    assert "](https://evil.example)" not in body
    assert "\\[click\\]" in body and "\\*\\*bold\\*\\*" in body
    table_rows = [line for line in body.splitlines() if line.startswith("| ") and "Evil" in line]
    assert len(table_rows) == 1  # the newline in the name did not start a new row
    ok = Event(
        id="y-2026", name="Ok", url="https://ok.example",
        sources=[SourceRef(kind="devpost", url="https://ok.devpost.com/", seen_at=now)],
        added_at=now, updated_at=now,
    )
    assert "[devpost](<https://ok.devpost.com/>)" in pr_body([ok])
