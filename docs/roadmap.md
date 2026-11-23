# Roadmap

What is done, what is open, and ideas for later. Keep it current: move finished items to **Done** in
the same PR, and add new problems or ideas here rather than only in chat. Live odds and stage status
belong in `data/events/<id>/status.md`, not here.

## During PGL Major Singapore 2026 (Nov 24 - Dec 13)

- **Market odds.** Collected by hand in the Browser pane before each round (Stage 1 round 1 done on
  2026-11-23): OddsPortal match pages, every listed bookmaker's pair made margin-free, then averaged
  (`docs/sources.md`). OddsPortal has no API and only renders odds after a click from the event page, so
  it cannot run in the poller. Automation would need an odds API with CS2 match-winner odds and a free
  key (candidates: OddsPapi, odds-api.io; check terms and the free tier first), called from the poller
  once per round before its first match.
- **Bo5 final veto.** `veto.bo5` copies PGL's Cluj-Napoca 2026 grand final and is marked `unverified`.
  If PGL publishes the Singapore procedure before Dec 13, replace it and drop the flag
  (`docs/rules.md`).
- **Playoffs review.** The Stage 1-3 reviews are scheduled (`docs/automation.md`); the playoffs have
  none. Schedule one for Dec 14 or run the `review-stage` skill by hand after the final.
- **Playoff stage by date.** The poller picks the playoff stage by its dates (Dec 9-14). This has only
  been tested with a forced stage id; check the first poll after Stage 3 advances.
- **Stage 2 and 3 storylines.** The Stage 2 and 3 team notes say storylines will be "added from
  previews (nightly research task)", but the nightly research refresh only looks for news (rosters,
  stand-ins, visas). Either widen that routine to the next stage's previews or fill them in by hand
  with the `research-team` skill before Stage 2 (Nov 28) and Stage 3 (Dec 2).

- **Site and `simulate.ts` when the real draw differs.** The stage page's bracket (`swissBracket`),
  its in-browser simulation (`sim.worker.ts`) and `simulate.ts` use the engine's pairing for the
  current round. If Valve's draw ever differs, the bracket shows the wrong pairs and the live odds show
  an error until the round is finished; the poller, snapshots and `status.md` already use the real draw.
  Fix: the poller saves the announced pairings in the event data and the others read them.
- **Partial draw at snapshot time.** If a round finishes while the page lists only part of the next
  draw, that round's snapshot is saved with the engine's pairing (no warning). Rare; could wait a poll.
- **Poller stage choice by date.** `pickStage` (which stage to poll today, Swiss → Swiss → playoffs) is
  only covered by the live poller; the flow checks call the stage handling directly.

## After the event

- **Backtests on past Majors.** Parameter changes are capped at 10% per stage until backtests exist.
  Bracket fixtures for Austin 2025 and Cologne 2026 are in `engine/playoffs/fixtures/`; full backtests
  need historical match data, ideally through Liquipedia's LPDB API (access has to be requested).
- **Placeholder pages.** Team, matchup and odds over time (`docs/core/design.md`).
- **Hosting.** The site is a static build and runs locally only. The repo is public, so GitHub Pages
  is an option.
- **Next event.** A new folder under `data/events/` (see "Adding an event" in the README).
- **Small chores.** Bo1 vs Bo3 splits in the team notes are "not collected yet"; `biome.json` uses
  the deprecated `recommended` field (`npx biome migrate`).

## Done

- 2026-11-21: Stage 1 ready: Swiss engine with Valve pairing, ratings from VRS and map stats, 32 team
  notes, round 1 snapshot, site v1, hooks, skills and cloud routines.
- 2026-11-22: Repo public, README and licences; self-chaining GitHub Actions poller kept alive for the
  whole event window (PRs #13, #14).
- 2026-11-22/23: Playoffs: engine with Bo5 final and third place (#15), whole-event title odds (#16),
  bracket poller, advance and snapshots (#17), playoffs page (#18).
- 2026-11-23: `simulate.ts` prints playoff odds; this roadmap; docs checks (a path test in
  `npm run check`, a weekly docs checkup in the cleanup routine, findings shown at session start).
- 2026-11-23: Swiss flow check (`check-swiss-flow.ts`: Stage 1 → 2 → 3 → playoffs seeded on made-up
  pages through the poller's own code). It found that a part-played round stopped the poller (the
  played matches were missing from the announced pairings); fixed in the engine.
- 2026-11-23: Methodology page (`#/methodology`): data sources, the poller, ratings, veto, what each
  percentage means, scoring against the market, limits. Parameter values come from `params.json`.
