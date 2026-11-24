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
| `docs/roadmap.md`    | What is done, what is open, and ideas for later                                                   |
| `data/schemas/`      | Zod schemas; `index.ts` maps file paths to schemas                                                |
| `data/teams/`        | `registry.json` (IDs, aliases, dated rosters) + `<team-id>.md` research notes                     |
| `data/model/`        | `params.json` (weights), `modifiers.json` (logged judgment calls)                                 |
| `data/ratings/`      | `current.json` + `history/`                                                                       |
| `data/events/<id>/`  | config, teams, results (real only), benchmarks, snapshots (never edited), accuracy, status        |
| `engine/`            | Pure TS: Swiss pairing, playoffs, veto, ratings, simulation, scoring. No I/O                      |
| `scripts/`           | I/O: validate, fetch, log results, snapshot, simulate                                             |
| `site/`              | React + Vite + Tailwind v4 static site                                                            |

## Commands

- `npm run check`: typecheck + lint + tests (run before committing code)
- `npm run validate`: validate all data files
- `npm run dev` / `npm run build`: site
- Scripts run as `node scripts/<name>.ts` (Node runs TypeScript natively; use `.ts` import extensions):
  - `research/vrs-form.ts <event> <YYYY_MM_DD>` → `data/teams/form/` (Valve VRS match tables)
  - `research/team-files.ts <event>` → lean `data/teams/<id>.md` (never overwrites)
  - `research/liquipedia-rosters.ts <event>` → dated rosters in `registry.json` (Liquipedia API)
  - `research/short-names.ts <event>` → team short names (NIP, LVG) in `registry.json` (one Liquipedia
    API call); teams renamed for the event get `shortName` in its `teams.json`
  - `research/import-map-stats.ts <file> <from> <to> Top50` → `data/teams/maps/` (HLTV counts)
  - `research/oddspapi-setup.ts [pattern]` → prints OddsPapi ids for `marketOdds` in event config
    (market odds are then collected by the poller; benchmark only)
  - `build-ratings.ts <event>` → `data/ratings/current.json` (VRS prior + map stats; once results exist it only adds missing teams)
  - `advance` happens automatically: when a Swiss stage finishes, the poller seeds its 8 advancing teams
    into the next stage (seeds 9-16; playoffs: seeds 1-8) and saves that stage's round 1 snapshot
  - `score-stage.ts <event> <stage>` → score block in `data/events/<id>/accuracy.md`
  - `simulate.ts <event> <stage>` (prints odds; Swiss or playoffs) · `snapshot.ts <event> <stage>`
    (pre-round, once)
  - `log-result.ts ...` (manual) · `poll-liquipedia.ts <event>` (runs in GitHub Actions; needs `LIQUIPEDIA_CONTACT`;
    Swiss stages, then the playoff bracket once Stage 3 has advanced)
  - `check-swiss-flow.ts` / `check-playoff-flow.ts` → end-to-end Swiss (Stage 1 → playoffs seeded,
    through the poller's own page handling) and playoff pipelines on made-up data in a temp copy (both
    run in `npm run check`)
  - `install-launchd.ts pull` (Mac sync of cloud results) / `--uninstall <pull|poll>`

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
10. `README.md` is the public front page. Update it in the same PR when commands, layout, requirements,
    automation, licences or "Current limitations" change (e.g. playoffs built, market odds collected,
    backtests done). Never put live numbers, odds or stage status in it; link to `status.md` and `docs/`.
11. `docs/roadmap.md` is the to-do list. When work finishes, move it to Done in the same PR; when an
    open problem or idea comes up, add it there, not only in chat or memory.
12. Docs follow the code. A PR that changes behaviour, commands, files or automation also updates
    everything that describes it: README, this file, `docs/`, skills, agents and the routine prompts
    listed in `docs/automation.md`. `npm run check` fails when a doc names a path that no longer
    exists. The weekly `cleanup` routine checks the rest and writes `data/checkup.md`; the session
    start prints its open findings: raise them and fix them through a PR.

## Skills (`.claude/skills/`)

| Skill           | When                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------- |
| `log-result`    | Record a real result, update ratings, re-simulate, snapshot (manual fallback to the poller) |
| `research-team` | Research one team (or a stage) and update its data, notes and modifiers                     |
| `simulate`      | Re-run the simulation and report the odds (read-only)                                       |
| `review-stage`  | Score a finished stage, write lessons, propose capped changes via PR                        |
| `cleanup`       | Remove expired modifiers, mark stale facts, check sources                                   |
| `ui-review`     | Check a site page in the Browser pane (desktop + mobile) and list readability fixes         |

## Subagents (`.claude/agents/`)

`team-researcher` (Sonnet, medium; max 4 in parallel) · `reviewer` (Sonnet, high; read-only) ·
`checker` (Haiku, low; read-only)

## Models

Engine, ratings, debugging: Opus high. UI, scripts, schemas: Sonnet medium. Research: Sonnet medium.
Reviewer subagent: Sonnet high. Mechanical checks: Haiku low. Avoid xhigh/max/Fable on Pro.
