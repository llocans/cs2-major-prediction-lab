# CS2 Major Prediction Lab

Research CS2 teams, keep sourced notes, simulate tournaments, show results in a minimal static web UI.
Current event: **PGL Major Singapore 2026** (`data/events/pgl-major-singapore-2026/`). Built to work for
future events too: formats live in config, never in code.

## Repo map

| Path                 | What                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `docs/core/`         | Protected principles: engineering, design, data, model-principles. Edit only on a `core/*` branch |
| `docs/rules.md`      | Tournament rules with sources (Valve rulebook + PGL changes)                                      |
| `docs/model.md`      | Current model spec (formulas, parameters)                                                         |
| `docs/sources.md`    | Sources and access rules (Liquipedia API limits, HLTV interactive only)                           |
| `docs/automation.md` | launchd jobs, scheduled tasks, hooks                                                              |
| `docs/changelog.md`  | One line per automatic change                                                                     |
| `data/schemas/`      | Zod schemas; `index.ts` maps file paths to schemas                                                |
| `data/teams/`        | `registry.json` (IDs, aliases, dated rosters) + `<team-id>.md` research notes                     |
| `data/model/`        | `params.json` (weights), `modifiers.json` (logged judgment calls)                                 |
| `data/ratings/`      | `current.json` + `history/`                                                                       |
| `data/events/<id>/`  | config, teams, results (real only), benchmarks, snapshots (never edited), accuracy, status        |
| `engine/`            | Pure TS: Swiss pairing, veto, ratings, simulation, scoring. No I/O                                |
| `scripts/`           | I/O: validate, fetch, log results, snapshot, simulate                                             |
| `site/`              | React + Vite + Tailwind v4 static site                                                            |

## Commands

- `npm run check`: typecheck + lint + tests (run before committing code)
- `npm run validate`: validate all data files
- `npm run dev` / `npm run build`: site
- Scripts run as `node scripts/<name>.ts` (Node runs TypeScript natively; use `.ts` import extensions)

## Golden rules

1. Engine stays pure: no files, network or UI. Side effects only in `scripts/` and `site/`.
2. Strict TypeScript, no `any`. Validate data at boundaries with Zod (`scripts/lib/files.ts`).
3. Never invent stats. Every fact and derived number carries a source and a date. Verify current facts;
   never rely on memory for rosters or results.
4. `results.json` holds real results only. Snapshots are never edited. UI overrides never write files.
5. Judgment enters the model only through `data/model/modifiers.json` (capped, sourced, expiring).
6. HLTV and bo3.gg: interactive only (Browser pane), never in scheduled runs. Liquipedia: MediaWiki API
   only, 1 request / 2 s, cached, User-Agent from `.env`.
7. Data scripts commit to main after checks. Code, docs and `params.json` changes go via a branch + PR.
   Tag a known-good state before each stage (`stage1-start`, ...).
8. Conventional commits, small and focused. Log automatic changes in `docs/changelog.md`.
9. Chat replies stay short; results belong in the UI.

## Skills (`.claude/skills/`)

| Skill           | When                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------- |
| `log-result`    | Record a real result, update ratings, re-simulate, snapshot (manual fallback to the poller) |
| `research-team` | Research one team and update its file (planned)                                             |
| `simulate`      | Re-run the simulation and refresh predictions (planned)                                     |
| `review-stage`  | Score a finished stage, propose model changes (planned)                                     |
| `cleanup`       | Tidy files, mark stale data, fix references (planned)                                       |

## Models

Engine, ratings, debugging: Opus high. UI, scripts, schemas: Sonnet medium. Research: Sonnet medium.
Reviewer subagent: Sonnet high. Mechanical checks: Haiku low. Avoid xhigh/max/Fable on Pro.
