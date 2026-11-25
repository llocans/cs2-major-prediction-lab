# Project: CS2 Major Prediction Lab

> The original setup prompt (2026-11-21), kept for history and not kept up to date. Since then the
> repository went public and many decisions changed; `CLAUDE.md`, `README.md` and `docs/` are current.

## Purpose

A long-running local project where you (Claude Code) research CS2 teams in depth,
keep organized notes on every team, simulate tournaments, and show me the results
in a clean, minimal web UI. The goal is following the teams closely and making
educated, data-backed predictions about who wins. The first event is PGL Major
Singapore 2026, but everything must be built to work for future events too.

## Environment

- You run in the Claude Code desktop app on my Mac (Code tab, Local environment),
  in this folder. Not the terminal CLI. Use desktop app features where they fit.
- I'm on the Claude Pro plan. Usage limits (a 5-hour window and a weekly limit) are
  shared between Claude chat and Claude Code, so be economical with tokens and runs.
- Git with a PRIVATE GitHub repo, managed with the gh CLI. Assume GitHub Free.
- It runs locally for now. Online hosting may come later, so the site must build
  as a static site from day one.
- I know TypeScript and React.

## Phase 0: ask before you build

Stay in Plan mode. Do NOT create files or write code yet.

1. Ask me questions about anything still open: structure, UI, skills, subagents,
   hooks, the prediction model, automation, and anything important I missed.
   Ask in batches of max 4 questions, each with your recommendation.
2. Don't re-ask things that are decided below. Challenge a decision only if you
   see a concrete problem, and cite a source.
3. Work through the "Verify in Phase 0" list and report the results in a short table.
4. Once we agree, write the plan into the docs, set up the repo, and follow the
   order of work at the end.

## Verify in Phase 0

- Source access from this app: HLTV, bo3.gg, the Liquipedia MediaWiki API, Valve's
  standings repo, PGL's site. Report which return usable data via web fetch,
  which only work through the desktop app's Browser pane, and which fail.
- The official Singapore map pool. Expected: Valve's current Active Duty pool
  (Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke; Cache replaced Overpass).
- PGL event rules: Bo5 grand final veto, third-place decider format, Bo rules per
  stage (reports say Stage 3 is all Bo3, like IEM Cologne 2026).
- Whether Auto permission mode is available on my plan in the desktop app.
- Whether opusplan appears in the desktop model picker.
- Whether subagent frontmatter supports an effort field.
- Stop hook behavior: the stop_hook_active field and any limit on consecutive blocks.
- Whether @imports in CLAUDE.md load at startup.
- My GitHub plan (Free assumed).

## Already decided: stack

- Vite + React + TypeScript (strict) + Tailwind CSS v4 with a custom theme
- Zod for data validation, Vitest for tests, Biome for lint + format, tsx for scripts
- No backend, no database: JSON + Markdown files in git are the data store
- Simulation runs in a Web Worker with seeded random numbers (reproducible results)
- Bracket lines and connectors drawn as SVG using the same theme variables
- NOT used: Next.js, databases, Redux or other state libraries, component kits
  (MUI, shadcn, etc.), chart libraries (custom SVG first), Docker
- Add a dependency only when it solves a real problem the stack can't. Every
  dependency gets a one-line reason in docs/core/engineering.md

## Engineering principles (docs/core/engineering.md)

- KISS and YAGNI: the simplest solution that works. Build for planned growth,
  not imagined features
- Single responsibility and separation of concerns: engine (pure logic), data
  (files + schemas), scripts (I/O and automation) and site (UI) are separate layers.
  The engine never touches files, the network or the UI
- DRY: one source of truth for every piece of data and every rule
- Pure, deterministic functions in the engine. Side effects only at the edges
- Strict TypeScript, no `any`. Validate all data at boundaries with Zod
- Small modules and small components with clear names. One concept per file
- Tests for all engine logic, including replays of past Majors
- Errors are handled explicitly, never swallowed
- Conventional commits (feat:, fix:, data:, refactor:, docs:, chore:), small and focused
- No secrets in the repo. .env is gitignored
- Clear over clever: code should read like a senior engineer wrote it

## Repo structure (improve it in Phase 0 if needed)

/CLAUDE.md -> short (under ~150 lines): purpose, repo map, golden rules,
which skill to use when. No @imports of large docs
/docs/core/ -> PROTECTED core principles: engineering.md, design.md,
data.md, model-principles.md
/docs/ -> reference docs, read on demand: rules.md (tournament rules),
model.md (current model spec), sources.md, automation.md,
changelog.md (one line per automatic change)
/.claude/skills/<name>/SKILL.md -> workflows, loaded on demand
/.claude/agents/ -> subagent definitions
/.claude/hooks/ -> hook scripts
/.claude/settings.json -> hooks and permissions
/data/schemas/ -> Zod schemas for every data file (versioned)
/data/teams/<team-id>.md -> one research file per team (template below)
/data/model/params.json -> model weights and settings
/data/ratings/ -> current ratings + history
/data/events/<event-id>/
config.json -> format per stage, round and match type; map pool; seeding
teams.json -> participants, seeds, event aliases
results.json -> real results only (single source of truth)
snapshots/ -> predictions saved before each round, never edited
accuracy.md -> predictions vs results, scores, lessons learned
status.md -> generated short summary of the current event state
/engine/ -> Swiss + playoffs + veto + ratings + scoring (pure TS)
/scripts/ -> fetch results, update ratings, re-simulate, validate, snapshot
/site/ -> React app that reads /data

## Skills (workflows that load on demand)

Starting set, improve it in Phase 0:

- research-team: research one team and update its file
- log-result: record a real result, update ratings, re-simulate, save snapshot
- simulate: run the simulation and refresh predictions
- review-stage: score a finished stage and propose model changes
- cleanup: tidy files, mark stale data, fix broken references
  Every skill and subagent sets model: and effort: in its frontmatter. Skills with
  side effects (writing data, committing) set disable-model-invocation: true.

## Data model rules (docs/core/data.md)

- Every team has a stable ID that never changes. Display names and event aliases
  are separate fields. At this event PGL renamed four teams:
  BC.Game -> GOSH, 1win -> THE ONE, BetBoom -> BB Team, PARIVISION -> PVISION
- Rosters are stored with dates, so past predictions point to the right lineup
- Every data file carries a schemaVersion, so old events keep loading after changes
- Store the numbers you derive (map win rates, player ratings, etc.), each with its
  source and retrieval date. Don't store whole copied stats tables
- Facts in team files carry a date and a source. Stale info is marked stale
- Tournament formats live in config, never hardcoded
- results.json holds only real results. Snapshots are never edited after saving
- Manual overrides in the UI live only in memory or in the URL. They never write
  to results.json or snapshots

## Team file template (starting point)

- ID, name, aliases, region, VRS rank and points, starting stage, last updated
- Current lineup + coach (with dates), roster changes, stand-ins
- Recent form (last 3-6 months): placements, notable wins and losses
- Map pool: win rates per map, usual picks and bans, weak maps, maps with little data
- Key players: current form and ratings
- Head-to-head vs teams in this event
- Major experience, travel and jet lag notes, Bo1 vs Bo3 performance
- Strengths, weaknesses, storylines
- Sources (with dates)

## The prediction model (docs/model.md; must be dynamic)

Code does the math. You do the research and judgment.

- Each team has a rating (Elo/Glicko-style). Cold start: teams with little tier-1
  data (e.g. Chinggis Warriors, Lynn Vision, DENDELE) start from a prior based on
  VRS points, with wider uncertainty
- Map-level strength per team, pulled toward the team's overall rating when map data
  is thin. Newly added maps (Cache) start from the overall rating with wide uncertainty
- Matches are simulated map by map, using a veto model that follows the exact
  veto sequences in docs/rules.md
- After every real match: update ratings (maps, round differences and format, with a
  Bo1 counting less than a Bo3), update map stats, then re-simulate the rest of the
  event (Monte Carlo, 10,000 runs, seeded; standard error under 0.5 percentage points)
- Before each round, save a snapshot automatically. Stage 1 rounds 1 and 2 are both
  on Nov 24, so the round 2 snapshot must be saved automatically right after the
  round 1 results are logged and the round 2 pairings are known
- Your qualitative judgment (roster change, stand-in, form slump, etc.) enters ONLY
  as explicit, logged modifiers with a size limit, a reason, a source and an expiry
- After each stage: score accuracy (Brier score and calibration) and record lessons
  in accuracy.md. A Swiss stage has only 33 matches, which is too few to retune on:
  cap how much weights can change per stage (define the cap in model.md), and do
  real retuning with backtests on past Majors. Parameter changes go through a PR
- Every prediction shows a probability, a confidence level and a short reason

## Tournament rules (docs/rules.md, encoded in event config)

Valve's Major Supplemental Rulebook gives the base rules
(github.com/ValveSoftware/counter-strike_rules_and_regs). PGL's event rules add
the changes for Singapore. Cite the source for every rule in rules.md.

Swiss stage (Valve):

- Elimination and advancement matches are Bo3, all other matches Bo1, unless the
  event overrides it (PGL Stage 3 is reportedly all Bo3: verify)
- Round 1 pairs by initial seed: 1v9, 2v10, 3v11, 4v12, 5v13, 6v14, 7v15, 8v16
- Mid-stage seeding, in order: current W-L record, then Difficulty Score, then the
  stage's initial seed
- Difficulty Score = the sum of current wins minus the sum of current losses of every
  opponent faced. This is NOT chess Buchholz. Implement it exactly as Valve defines it
- Rounds 2 and 3: the highest seed plays the lowest available seed that doesn't
  cause a rematch
- Later rounds: Valve's 15-row priority table for groups of 6 teams; pick the
  top-most row that doesn't cause a rematch. Copy the table into rules.md
- Teams don't play the same opponent twice in a stage, if possible

Playoffs:

- Valve: 8 teams, single elimination, all matches Bo3, bracket 1v8 and 4v5 on one
  side, 2v7 and 3v6 on the other, using final Stage 3 seeds
- PGL (Singapore): Bo5 grand final, and a third-place decider (first in Major
  history; verify its format)

Map veto (Valve):

- Bo1: the higher seed chooses Team A or B. A removes 2 maps, B removes 3,
  A removes 1. B chooses the starting side on the remaining map
- Bo3: the higher seed chooses Team A or B. A bans, B bans, A picks map 1 (B picks
  side), B picks map 2 (A picks side), B bans, A bans, the remaining map is the
  decider (B picks side)
- Bo5: from PGL's rules (verify)
- Map pool: mapPool in the event config, from Valve's Active Duty pool (verify)

Formats per stage, round and match type are data in config. Engine tests replay
past Majors to prove the pairing logic matches real brackets.

## Reusing existing work

Study these for logic and ideas, then write our own implementation following the
rules above. Do not copy code files verbatim.

- github.com/claabs/cs-buchholz-simulator (TypeScript, Monte Carlo, head-to-head odds input)
- github.com/ndunnett/major-pickems-sim (Valve seeding and pairing rules)
  For UI ideas only (see how they work, don't copy): HLTV's Swiss Simulator and
  BLAST.tv's Major simulator. Search for other good open references and report them
  in Phase 0.

## Research and sources (docs/sources.md)

1. HLTV.org: results, map stats, player ratings, head-to-head, rankings
2. Liquipedia: brackets, roster history, results
3. bo3.gg: detailed match and map stats
4. Valve Regional Standings: github.com/ValveSoftware/counter-strike_regional_standings
5. PGL official site and socials: official schedule, bracket and rules
6. News for rosters and interviews: Dust2.us, Sheep Esports, Dexerto, Dot Esports, pley.gg
   Access rules:

- HLTV and bo3.gg: interactive research only. Web fetch may return no usable data
  (JS-rendered pages). Fallback: the desktop app's Browser pane, interactively.
  Never use either in scheduled runs
- Liquipedia, for automation: only the MediaWiki API. Max 1 request every 2 seconds,
  action=parse max 1 every 30 seconds, a custom User-Agent with the project name and
  my contact (ask me for it), gzip enabled, and responses cached locally. No
  automated access to rendered HTML pages. The LPDB API needs approved access and an
  API key: ask me in Phase 0 whether it's worth applying
- Liquipedia content is CC-BY-SA 3.0: keep the source on every record. When the site
  goes public, show Liquipedia as a data source
- If a source is unreachable, say so and use the next one. Never invent stats
- Always verify current facts. Never rely on memory for rosters or results

## UI and design (docs/core/design.md)

v1 is a single view, simple and working really well:

- The current stage's Swiss bracket, with real and predicted results clearly different
- Probability table per team: 3-0, advance, 0-3, playoffs, title
- A team panel with key info and a short "why" for the prediction
- I can swap teams and override results by hand, and the page re-simulates
  instantly (overrides stay in memory or the URL). Mostly YOU use it to show me
  what you simulated
  Plan for growth from day one, with routes and placeholder pages: event overview,
  each stage, playoffs, team pages, matchup pages, track record, odds over time,
  methodology. Components are built so these fill in later without rewrites.
  Design rules:
- Clean, minimal, easy for a human to read. It must NOT look like a generic AI-made page
- Custom Tailwind theme tokens from day one (colors, fonts, spacing, radius).
  Remove the default color palette so only our colors exist
- No gradients, no glow, no emoji, no decorative shadows, small radius
- Hierarchy through typography, spacing and alignment. A restrained palette with
  one accent color. Think good sports-graphics typography
- Fast and smooth: the simulation never blocks the UI. Works on desktop and mobile
- All results and data are shown to me in the UI. Chat replies stay short

## Automation (docs/automation.md)

Three layers, hands-off, with guardrails:

1. Plain scripts with NO Claude usage, scheduled with macOS launchd: fetch results,
   update ratings, re-simulate, validate, snapshot, commit. launchd doesn't run while
   the Mac sleeps; missed runs happen once on wake.

2. Claude judgment runs as Desktop scheduled tasks (local, "Only on this computer"):
   research updates, stage reviews, cleanup. A few short runs a day.
   - Each task has its own model and permission mode
   - After creating a task, do one "Run now" with me and always-allow the tools it
     needs, so later runs don't stall on permission prompts
   - Tasks only run while the app is open and the Mac is awake. After sleep there is
     one catch-up run for the latest missed time, so every task prompt includes
     guardrails for running late (e.g. skip work that is already outdated)
   - On match days I turn on "Keep computer awake". Stage 1 matches start at
     06:00 Riga time (05:00 CET), Nov 24-27
   - Fallback only if needed, headless `claude -p`: never use --bare (it ignores the
     subscription login and needs an API key). Use --permission-mode auto
     --permission-prompts none plus --allowedTools. Project hooks run there too

3. Hooks in .claude/settings.json. They must be fast, deterministic and safe in
   unattended runs:
   - PostToolUse (Edit|Write under /data): validate the edited file against its schema
   - PreToolUse (Edit|Write): deny edits to docs/core/ while on the main branch (core
     changes only on a core/* branch with a PR); deny edits to existing snapshot files
   - Stop: only if code files changed since the last check, run typecheck, lint and
     tests. Respect stop_hook_active, and stop blocking after a few attempts and
     report instead, so it can't loop
   - SessionStart: show data/events/<id>/status.md

Subagents: run at most 4 in parallel. Research subagents use Sonnet 5.5 (medium),
the independent reviewer uses Sonnet 5.5 (high), mechanical checks use Haiku 5.5 (low).

Branch and merge policy (GitHub Free has no auto-merge for private repos):

- Data scripts run all checks locally and commit straight to main
- Code, docs and model parameter changes go to a branch with a PR (gh) and a
  plain-language summary. I review and merge. GitHub Actions on PRs is optional
- docs/core/ changes only via a core/* branch and PR (enforced by the hook)
- Tag a known-good state before each stage starts
- Every automatic change gets a line in docs/changelog.md

## Model and effort

Desktop controls: model picker (Cmd+Shift+I), effort (Cmd+Shift+E), permission mode
(Cmd+Shift+M). Plan mode applies only to the current session.

- Phase 0, architecture, Swiss/Difficulty logic, rating model, debugging engine
  test failures: Opus 5.5, high (or opusplan if the picker offers it)
- UI, scripts, schemas: Sonnet 5.5, medium
- Scheduled research runs: Sonnet 5.5, medium
- Reviewer subagent: Sonnet 5.5, high
- Mechanical subagents (format checks, summaries): Haiku 5.5, low
- Avoid xhigh, max and Fable on Pro (Fable may bill usage credits), except for
  rare, hard bugs
- Every skill and subagent sets model: and effort: in its frontmatter

## Event context (verify all of this before using it)

PGL Major Singapore 2026, the second CS2 Major of 2026 and the first in Southeast Asia. $1.25M prize pool.

- Stage 1: Nov 24-27, 16 teams, Swiss
- Stage 2: Nov 28-Dec 1, 8 Stage 1 survivors + 8 invites
- Stage 3: Dec 2-6, Swiss
- Playoffs: Dec 10-13, Singapore Indoor Stadium, Bo5 grand final, third-place decider
  Stage 3 invites: MOUZ, Vitality, FURIA, Aurora, Spirit, BetBoom ("BB Team"),
  Falcons (defending champions), Legacy
  Stage 2 invites: FUT, Nemiga, G2, 1win ("THE ONE"), NAVI, Astralis, The MongolZ, MIBR
  Stage 1: NIP, PARIVISION ("PVISION"), HEROIC, FaZe, Eternal Fire, 100 Thieves,
  Liquid, 9z, M80, DENDELE, Imperial, Wildcard, BC.Game ("GOSH"), FlyQuest,
  Chinggis Warriors, Lynn Vision
  Stage 1 Round 1 (Bo1, Nov 24): HEROIC vs Imperial, 9z vs Lynn Vision, NIP vs M80,
  100 Thieves vs Chinggis Warriors, Liquid vs GOSH, PVISION vs DENDELE,
  FaZe vs Wildcard, Eternal Fire vs FlyQuest. Round 2 is played the same day.

## Order of work after Phase 0

1. Minimal setup: repo, CLAUDE.md, docs/core, schemas (teams, results, snapshots,
   event config), Stage 1 config
2. Minimal engine: Stage 1 Swiss (Valve pairing, Difficulty Score, Bo rules) +
   Monte Carlo, with tests for the pairing rules
3. The 16 Stage 1 team files and initial ratings (VRS prior + research)
4. A Stage 1 snapshot (JSON) saved before the first match
5. The log-result skill and script, with automatic round snapshots
6. v1 UI
7. Automation: hooks, skills, scheduled tasks, launchd jobs
8. Stage 2 and 3 teams, playoffs and full veto, backtests on past Majors,
   track record page

Start now with your Phase 0 questions.
