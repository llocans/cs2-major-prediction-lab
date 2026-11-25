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
- **Check the new research refresh (Nov 26).** Read the first run of the reworked prompt
  (2026-11-25 21:00 UTC): it should list every team (22 after round 3: 14 left in Stage 1 plus 8
  Stage 2 invites) with about 24 searches. If it skips teams or runs far longer, tighten the prompt.
  On Nov 27 it also fills Stage 2 storylines; check those too.
- **`status.md` lags after a model change.** The poller rewrites `status.md` on every poll but only
  commits it with new results, so a merged change to predictions (e.g. the little-data confidence fix
  on 2026-11-24) or a reordered draw shows up there only after the next result. Commit it on its own
  when the match lines or confidence change (not on simulation noise), or regenerate it in the PR.

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
- **Playoff bracket in the new bracket style.** The Swiss bracket now uses group panels, short names
  with 20 px logos and fixed arrows; the playoff bracket's match boxes still use the older look.
  Bring them in line when the playoffs page is next touched. Its "Simulating changes…" text still
  sits in the header subtitle and pushes the page down while it shows; give it a reserved spot
  above the bracket like the stage page (`SimStatus` `reserve`).
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
- **Small chores.** Bo1 vs Bo3 splits in the team notes are "not collected yet".
- **GitHub Actions versions.** The poll and check workflows use `actions/checkout@v4`,
  `setup-node@v4` and `upload-artifact@v4`, which GitHub already forces from Node 20 onto Node 24
  (warning in every run). v7 is out; upgrade after the event, not mid-event (the poller pushes with
  the checkout's credentials).

## Done

- 2026-11-25: Below 1024 px the team panel keeps its desktop width (340 px per column) and is
  centred above the bracket and table, so its text never stretches across the page.
- 2026-11-25: Stage page spacing: from 1280 px a wider gap (80 px) between the Probabilities table and the team
  panel, with a narrower team-name column; at 768-1023 px, where the panel sits above the table, it
  uses two columns (match history on the right), so it is about 40% shorter and its tables don't
  stretch.
- 2026-11-25: Team panel keeps one shape for every team: the next match is the last row of "This
  stage" (marked NEXT, with its format) instead of a separate block, and thin lines separate the
  sections.
- 2026-11-25: While a simulation runs, predicted numbers stay orange and pulse instead of turning
  grey (grey with reduced motion); the snake border around the bracket is gone (user: too much).
- 2026-11-25: Stage page loading indicator: while a simulation runs, an orange segment circles the
  Swiss bracket (a faint outline only with reduced motion).
- 2026-11-25: Stage page: "Simulating changes…" moved from under the dates to the right end of the
  bracket legend, with its space kept while idle, so the page no longer jumps on a what-if click.
- 2026-11-25: Playoffs header shows only the dates (and the played count once seeded), not the
  match formats.
- 2026-11-25: One page frame for every page (`components/Page.tsx`): the same title block, gaps
  and subtitle width everywhere (Playoffs and Pick'Em had tighter headers, root gaps ranged
  24-40 px). A test fails if a page writes its own `<h1>` again. The page no longer jumps sideways
  between short and long pages (`scrollbar-gutter: stable`). Playoffs: no "Soon" line.
- 2026-11-25: Stages that have not started (Stage 2, Stage 3) show their dates and "Soon" instead
  of a seeding note and "Planned". The playoffs page shows "Soon" under its dates and no longer
  has the "playoff seeds are set when…" paragraph.
- 2026-11-25: Swiss bracket restyle (user's reference brackets): each record group is one panel
  with a header strip (record, BO1/BO3, tag) and match cards; empty groups show faint slots instead
  of dashed outlines. Every group gets the same short arrow pair (winners up-right, losers down-right)
  instead of bent lines of different lengths. Advanced/Eliminated boxes get a soft green/red fill
  (`win-soft` / `loss-soft`). Short names with 20 px logos make the bracket 1220 px wide (was 1332).
  No new dependencies.
- 2026-11-25: Probabilities table fits its column at every width: it switches to short names (NIP)
  by its own width (a container query) instead of the window's, which fixes it running under the
  team panel at 1024-1070 px and a sideways page scroll at 640-680 px. The UI audit now also
  measures 1024 px and fails on a table wider than its box (planted-problem test added).
- 2026-11-25: Stage page selection and marks: no team is selected when a stage opens (a short hint
  instead of the team panel); clicking the selected team again, or the ✕ on the panel, clears it.
  Shorter bracket legend (62% and W* only). Pick marks on finished matches in softer green/red, and
  close calls under 55% now get ✓/✗ too instead of grey (bracket and team panel).
- 2026-11-25: Nightly research refresh reworked: it ran 2 searches in 25 s and still reported "all 16
  teams checked". Now one search per team still in the event or entering the next stage, follow-up
  only on leads, an honest "N of N" count, and storylines from previews the night before Stage 2
  and Stage 3. `biome.json` migrated (`preset`); the setup prompt is marked as historical.
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
