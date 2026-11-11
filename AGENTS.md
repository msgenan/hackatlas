# hackatlas — agent notes

- Data contract: `collector/hackatlas/model.py` (Pydantic). The site's TypeScript types mirror it; change both together.
- Data: `data/events.json` (approved, published), `data/pending.json` (candidates), `data/rejected.json` (never re-propose),
  `data/sample-events.json` (fictional, dev and tests only — never publish).
- Collector: `cd collector && uv venv && uv pip install -e ".[dev,llm]" && .venv/bin/pytest`.
- Site: `cd site && pnpm install && pnpm dev`. Build: `pnpm build` (static, GitHub Pages).
- Never copy long descriptions from sources; store a short summary in our own words and link the source.
- No secrets in the repo. The API key comes from the `ANTHROPIC_API_KEY` environment variable / Actions secret.
- Plan and progress: `.ai/PLAN.md`.
