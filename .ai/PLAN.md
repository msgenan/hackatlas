# hackatlas plan (v1)

Goal: one calm, readable site listing hackathons (Turkey + global), every event showing the same fields in the
same places. Data is collected daily, new records wait for human approval (a PR merge), then publish.

Field order everywhere: deadline, dates, format/location, prize, team size, eligibility, organizer, source.
Missing value shows "Belirtilmemiş", never an empty gap.

## Steps
1. Data contract + skeleton (main session). Done: 10 sample records validate against `collector/hackatlas/model.py`.
2. Structured collectors: Devpost, MLH, Devfolio, Techcareer; merge/dedup, pending/rejected handling, CLI (Sonnet).
   Done: tests pass, one real run yields >= 30 real upcoming events.
3. LLM collectors: web search (Claude API web_search tool) and Instagram (reads a JSONL export) (main session).
   Done: tests pass with mocked API; real run once an API key exists.
4. Approval flow: daily GitHub Action opens a "Yeni hackathonlar (N)" PR; local `hackatlas review` (Sonnet).
   Done: actionlint clean, dry run renders the PR body.
5. Design system (main session, ui-design skill) then Astro site pages (Sonnet).
   Done: build passes; empty list, missing fields, long titles, past events all render correctly.
6. Independent review (Codex; fallback Opus subagent).
7. Verification: verification-loop + browser-qa (desktop, phone width, both themes). Done: PASS report.
8. Publish: public repo msgenan/hackatlas, GitHub Pages.

## Out of v1
Direct LinkedIn scraping; participant reviews of events (v2).
