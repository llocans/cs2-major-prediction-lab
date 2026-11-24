# Roadmap

What is done, what is open, and ideas for later. Keep it current: move finished items to **Done** in
the same PR, and add new problems or ideas here rather than only in chat. Live odds and stage status
belong in `data/events/<id>/status.md`, not here.

## During PGL Major Singapore 2026 (Nov 24 - Dec 13)

- **Bo5 final veto.** The Bo5 final is Valve's rule for all Majors; its veto order is not published.
  `veto.bo5` copies PGL's Cluj-Napoca 2026 grand final and is marked `unverified`.
  If PGL publishes the Singapore procedure before Dec 13, replace it and drop the flag
  (`docs/rules.md`).
- **Playoffs review.** The Stage 1-3 reviews are scheduled (`docs/automation.md`); the playoffs have
  none. Schedule one for Dec 14 or run the `review-stage` skill by hand after the final.
- **Playoff stage by date.** The poller picks the playoff stage by its dates (Dec 9-14). This has only
  been tested with a forced stage id; check the first poll after Stage 3 advances.
- **Market odds by hand.** OddsPapi lists no PGL Singapore fixtures after round 1 (its round 1 ones
  are marked cancelled, checked 2026-11-24), so the poller adds nothing. Each round's odds are read
  from OddsPortal in the Browser pane after the round (`docs/sources.md`), in a session after each
  round. Free automatic sources checked on 2026-11-24, none usable:
  [Kalshi](https://kalshi-public-docs.s3.amazonaws.com/Kalshi-Developer-Agreement.pdf) has a market
  for every game of this Major and a public API, but its Developer Agreement (v1.1, §3) limits the
  API to a member's own trading and forbids storing, sharing or benchmarking with its data;
  [OddiWire](https://oddiwire.com/docs.html) (free 100 calls/day) is one odds supplier's prices, drops
  a match once it finishes, and its terms do not say whether the prices may be shown; the
  [mwasoft CS2 API](https://www.producthunt.com/products/cs2-real-time-odds-api-by-mwasoft) gives its
  own model's odds, not a market. CSGOEmpire (the Market odds page) cannot be automated either:
  its terms forbid bots and scripts.
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

- **Map guesses (user, 2026-11-24).** The veto in `engine/veto.ts` picks the likely map for every
  match, but the site does not show it since the team panel's "Why" was removed, and nothing scores
  it. Stage 1 rounds 1-2 by hand: right map in 2 of 10 matches (chance about 1 in 7). Known cause: a
  map a team never played (Cache) gets offset 0 unless the team has 15+ maps, so the simulated veto
  leaves it in and it often ends up as the guess, while real teams ban it. Options: show per-map
  chances from the simulation, score map guesses on the Track record page, treat an unplayed map as
  a likely ban at smaller samples (changes predictions: ask first).
  Related, found 2026-11-24: in Bo1 the reason "HEROIC +32 rating on average" (round 3 vs M80) sat
  next to a 49% chance. Not a bug: HEROIC's edge is on Ancient, Inferno and Nuke (62-64%), M80 bans
  those, HEROIC bans its weak maps, and the expected decider Mirage is 50/50. The average over all
  seven maps misleads in a Bo1; the reason could name the likely map's chance first. The bans rest
  on small samples (e.g. HEROIC 3-4 on Mirage, M80 1-4 on Inferno).
- **Underdogs above the market.** In Stage 1 rounds 1-3 the model gave the underdog more than the
  bookmaker in most matches (Market odds page). Either the market is wrong or the model pulls toward
  50% too much (rating uncertainty, the flat VRS prior). Check after Stage 1 on the Track record
  calibration table and the Market odds record; any change goes through `review-stage` (capped).
- **Cold-start penalty (Stage 1 review, before Stage 2).** Little tier-1 data only widens a team's
  uncertainty; it never lowers its rating. In practice such teams are usually weaker than their VRS
  points say (points won against weak regional teams, no wins against top teams, first Major), and
  the market prices that in: GOSH vs Chinggis Warriors (R3) was 62% model vs 82% market. Evidence so
  far points both ways (Chinggis 0-2, FlyQuest 2-0). After Stage 1 compare the little-data teams'
  predicted and actual results (Chinggis, FlyQuest; DENDELE and Lynn Vision as a check). If they
  clearly underperformed, add a capped rating penalty for cold-start teams via a PR before Stage 2,
  where new invited teams arrive. Don't change it mid-stage (it would mix two models in the record).
- **Market pick rule review (Stage 1 review, before Stage 2; user, 2026-11-24).** Stage 1 is the test
  run of the rule in `engine/market-picks.ts` (pick at +5 pp or more, skip little data). Check:
  - **Picks on coin-flip matches.** Confidence isn't part of the rule, so a Low match where the model
    says ~50% still gets a pick when the market leans one way. These are bets on the model's flatness
    (R3: 5 of 6 picks were Low, e.g. HEROIC-M80 49% vs 43%). Compare the record of High/Medium picks
    with Low ones; if Low picks clearly do worse, skip matches the model calls within 5 points of 50%.
  - **The +5 pp threshold (user idea).** Replay Stage 1 at 3, 5, 8 and 10 pp (picks, won, lost) and
    see where the record holds up. Also consider a larger gap for Bo1 than for Bo3 (one map is more
    random). Stage 1 has ~40 matches, so prefer a simple rule over the best-fitting number.
  - **Per-confidence split on the Market odds page**, so the record shows which kinds of picks work.
  - **Keep old records honest.** The rule is applied to every saved round when the page is built, so
    changing it would silently rewrite Stage 1's record. Before any change, store the rule per stage
    (e.g. `marketRule` in the event config, with Stage 1 frozen at today's rule) and set a new stage's
    rule before its first odds are logged.
- **Fix the Pick'Em page (user, 2026-11-24).** It works oddly: picks don't lock, and the flow doesn't
  make sense. Go through it with the user first to list what should lock when (e.g. after a stage
  starts) and what feels wrong, then fix.
- **Pick'Em history of experts (user, 2026-11-23; start Nov 24).** A tab with past Major Pick'Em
  picks by content creators, casters and players, scored against the real results and against random
  picks, to test the hunch that "by the book" picks do no better than chance. Needs dated, sourced
  pick lists; the scoring can reuse `engine/pickem.ts`.
- **Pick'Em picks on every device.** Picks live in one browser. When the site goes live, decide
  whether to keep that or save them somewhere shared.

- **Stage page layout revisit.** The Stage 1 page feels complex: too much information at once, hard to
  read at a glance. Simplify after core features are settled (user, 2026-11-23). Ideas parked until
  then: per-match market % on the Track record rows (the data is already in `benchmarks.json`).
  First and second passes done 2026-11-24 (see Done); the `ui-review` skill checks the rest.
- **Visual regression screenshots.** CI could compare each page's screenshots with the last approved
  set and flag any change for a look. Needs fixed test data first (live data changes every round),
  e.g. a frozen copy of one finished event.
- **Nemiga's logo is marked temporary.** Liquipedia's team template uses
  `Nemiga Gaming 2020 temporary.png`. Re-run `research/team-logos.ts` before each event; it picks up
  a new file once Liquipedia changes the template.
- **Short names by date.** `research/short-names.ts` reads the undated team template, so GOSH and
  THE ONE got their `shortName` by hand. Dating the template for renamed teams (as `team-logos.ts`
  does) would set it automatically.

## After the event

- **Backtests on past Majors.** Parameter changes are capped at 10% per stage until backtests exist.
  Bracket fixtures for Austin 2025 and Cologne 2026 are in `engine/playoffs/fixtures/`; full backtests
  need historical match data, ideally through Liquipedia's LPDB API (access has to be requested).
- **Placeholder pages.** Team, matchup and odds over time (`docs/core/design.md`).
- **Hosting.** The site is a static build and runs locally only. The repo is public, so GitHub Pages
  is an option.
- **Next event.** A new folder under `data/events/` (see "Adding an event" in the README).
- **Round markets (idea, 2026-11-24).** Price round handicaps and total rounds: turn a map chance
  into a per-round win rate and simulate MR12 with overtime. Rough (ignores pistol rounds, economy and
  CT/T sides), so it needs real round scores to check before it is shown.
- **Small chores.** Bo1 vs Bo3 splits in the team notes are "not collected yet"; `biome.json` uses
  the deprecated `recommended` field (`npx biome migrate`).

## Done

- 2026-11-24: Match confidence is low whenever a team has little tier-1 data (GOSH vs Chinggis said
  medium while the Market odds page skipped it for little data).
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
- 2026-11-23: Automatic market odds (closing lines from OddsPapi's free plan) in the poller, off until
  a key is set. Compared first, from each provider's own pages read on 2026-11-23:
  [odds-api.io](https://odds-api.io/pricing) (new free keys paused, from £49/month),
  [The Odds API](https://the-odds-api.com/sports-odds-data/sports-apis.html) (no CS2),
  [PandaScore](https://www.pandascore.co/odds) (odds by sales contact, own model),
  [esportsodds.gg](https://esportsodds.gg/) (current data $99/month), [cs2-api.org](https://cs2-api.org/)
  and Polymarket (prediction-market prices; no per-match markets for this Major).
- 2026-11-23: Market odds switched on for PGL Singapore: OddsPapi tournament 51216, market 171,
  Pinnacle closing line (the only bookmaker the free historical endpoint returned in a test on PGL
  Cluj-Napoca 2026). Stage 1 round 1 stays the hand-collected OddsPortal set.
- 2026-11-23: Pick'Em page (`#/pickem/<stage>`): in-game style picks for each Swiss stage (3-0,
  3-1/3-2, 0-3) and the playoff bracket, the chance your picks pass from the simulation, the model's
  own picks, live right/wrong marks; saved in the browser. Market odds next to the model's in the
  team panel and on hover in the bracket. The site keeps finished simulations in the browser (keyed by
  their input and the engine's source), so unchanged pages show final odds at once; a quick first
  pass shows in grey.
- 2026-11-24: Stage page readability: model's pick marked on finished matches (green ✓ won, red
  crossed out lost, grey under 55%), team short names from Liquipedia in the team panel
  (`research/short-names.ts`), a cleaner team panel (no "Why", no seed swap), each team's change since
  round 1 in the Probabilities table, a shorter bracket legend, `ui-review` skill, a light/dark
  switch in the nav (follows the system until the viewer picks; saved in the browser).
- 2026-11-24: Market odds page (`#/market/<stage>`): the model against CSGOEmpire's margin-free odds,
  one tab per stage and a folding section per round; picks follow a fixed rule (an edge of 5 points
  or more, none with little tier-1 data). `scripts/log-odds.ts`, `log-odds` skill,
  `bookmaker-odds.json` backfilled for Stage 1 rounds 1-3.
- 2026-11-24: Team logos next to team names in tables, brackets, Pick'Em and the team panel, light
  and dark versions (`research/team-logos.ts`, Liquipedia team templates); GOSH and THE ONE show
  their Major logos.
- 2026-11-24: Stage page second pass: the bracket takes the full width (Probabilities and the team
  panel side by side below it), roomier match cards, green winner / red loser arrows (dashed until
  a group is played), advanced and eliminated boxes in rounds 4-5; Probabilities table with
  "Record", change since round 1 on 3-0 and 0-3, the Bo5 note on hover; team panel "Match history"
  (90-day W-L in colour), a little-data note only when a team really has little tier-1 data; Market
  odds sorted by confidence with its own column.
- 2026-11-24: UI checks by measurement and fresh eyes: `npm run ui-audit` (Playwright: every page at
  desktop and 375 px, light and dark; console errors, page scroll, cut-off text, overlaps, WCAG AA
  contrast) in CI with screenshots as an artifact, its own tests on planted problems, the
  `ui-reviewer` agent for layout changes only (the `ui-review` skill picks light or full), golden
  rule 14, and a Stop hook that runs the audit itself when site code changed. Light
  `ink-3` and `accent` and dark `ink-3` darkened/lightened slightly to pass AA contrast. The first
  fresh-eyes review found 27 issues on the Stage and Market pages; 22 fixed (stale match-history
  row, header alignment, impossible outcomes as "–", phone fit and tap targets, legend), and the
  audit's scroll-box check fixed the Track record and Methodology tables on phones.
- 2026-11-24: Market odds intro cut to one line ("The model against a bookmaker."); the pick rule
  and what Market % means moved to hovers on the Pick and Market headers.
- 2026-11-24: One market price per match on the site: CSGOEmpire where it was read before the
  round, otherwise OddsPortal's closing line, with the source named (team panel, bracket hover,
  Market odds rounds). The Stage page no longer shows "–" for the round being played when CSGOEmpire
  was logged, and Market odds rounds fill from OddsPortal when nobody had time for CSGOEmpire.
- 2026-11-24: Parallel chats: golden rule 13 (one folder, one chat; others in their own worktree)
  and a session-start warning when the folder already has uncommitted changes. Round 3's HEROIC vs
  M80 odds checked (veto, not a bug); underdog bias and round markets added as open items.
