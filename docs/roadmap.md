# Roadmap

What is done, what is open, and ideas for later. Keep it current: move finished items to **Done** in
the same PR, and add new problems or ideas here rather than only in chat. Live odds and stage status
belong in `data/events/<id>/status.md`, not here.

## During PGL Major Singapore 2026 (Nov 24 - Dec 13)

### Model upgrades: v0.2 for Stage 2, v0.3 for Stage 3 (agreed with the user 2026-11-26)

Stage 1 stays as it is: the test run of model v0.1 (snapshots are never edited). After 26 of its 33
matches the model's Brier score was 0.250 (the same as always saying 50%), the market's 0.269, and
the Bo1 map guess was right in 2 of 20 matches (guessing at random would get about 3). Too few
matches to tell skill from luck, so each upgrade is small, checked and run next to the old model.

**How each upgrade ships**
- The event config names the model version per stage; Stage 1 keeps v0.1.
- The previous version keeps running next to the new one on the same matches and is scored on the
  same results (a fair head-to-head on the Track record page, which names the version per stage).
- Before release, the new version replays Stage 1 from its pre-round data (a sanity check, not
  proof: 33 matches). Replaying v0.1 must give the saved numbers back (match odds within about
  1 pp: rounds 1-4 counted match odds from the runs before 2026-11-25).
- Model changes go in their own PRs, never mixed with UI or poller changes. Data collection is
  never part of a code PR. Poller PRs merge only while no match is live.
- Existing weights keep the 10% cap per stage; new inputs are allowed when the Stage 1 replay
  shows no harm and the old version runs alongside (`docs/core/model-principles.md`, rule 7).

**Hard deadlines**
- v0.2 merged before Stage 1's last match ends (Nov 27, last match 13:00 Riga, ends about 16:00):
  the poller saves Stage 2's round 1 snapshot the moment Stage 1 finishes. Aim for noon. Then tag
  `stage2-start`.
- v0.3 merged before Stage 2's last match (Dec 1), for the same reason.

**Order of work**
1. Setup (no prediction changes), Nov 26:
   - Roadmap (this section). Principle 7 wording (`core/*` PR).
   - Per-stage model versions, the old version scored alongside, Stage 1 replay script (one PR).
   - Track record page: the model version per stage and the alongside version's score on the same
     matches (UI PR, before Stage 2's first results on Nov 28).
   - Poller: save CT/T half scores and first side per map (in Liquipedia's `{{Map}}` fields
     `t1t`, `t1ct`, `t2t`, `t2ct`, `t1firstside`), save the announced pairings, and wait for a full
     draw before snapshotting (two PRs, merged after the day's matches; the draw one after Stage 1
     has advanced).

   Status 2026-11-26: steps 1 and 2 are done.
2. v0.2 (Stage 2), by Nov 27 noon:
   - Schema and import script for ban/pick habits (a new `vetoes` folder in `data/teams/`), then
     the data for the ~20 teams that may play Stage 2 (interactive, Claude in Chrome; first find a
     page that shows a team's ban and pick rates, HLTV or bo3.gg).
   - Model: the veto uses each team's real ban and pick habits; a better rule for a map a team never
     plays ("Map guesses" below); check the confidence labels against Stage 1 (Medium called 4 of
     11, Low 8 of 12). Regenerate `status.md` in the same PR. `reviewer` agent before merge.
   - Fallback if ban rates need ~200 page reads instead of ~20: v0.2 ships only the "never plays"
     rule and ban habits move to v0.3.
3. Market track, after Stage 1 ends and before Stage 2's first odds (Nov 27-28): the pick rule
   stored per stage with Stage 1 frozen, the pick rule review and the Stage 1 test-run note (one PR),
   then bet slips (own PR). Cut bet slips first if the day runs out. The Stage 1 review routine runs
   by itself on Nov 27; its capped proposals go into v0.3.
   Status 2026-11-27: the pick rule is stored per stage, reviewed (kept for Stage 2) and the Stage 1
   note is up, and bet slips are built (Done below).
4. v0.3 (Stage 3), Nov 28 - Dec 1. Decided with the user 2026-11-27: v0.2 stays unchanged for
   Stage 2; v0.3 fixes the known flaws in the data we already use (age, opponent strength, lineup)
   instead of adding new kinds of data, because 33 matches per stage cannot show whether a new input
   helps. Player data enters only through lineup changes (the lineup filter, capped modifiers for
   stand-ins); player ratings, opponent-specific vetoes and head-to-head wait for backtests (step 6).
   - **First: a ratings file per model version.** Recency, opponent strength and the lineup filter
     change how ratings are built, so v0.3 cannot share `data/ratings/current.json` with v0.1/v0.2
     (`engine/model-version.ts` refuses it; `docs/model.md`, "Model versions"). Each version needs
     its own ratings, built from the same results, before v0.3 can run with v0.2 alongside.
   - **Keep v0.2 alongside in Stage 3.** A finished stage's page locks its Playoffs and Title
     columns from the next stage's round 1 snapshot in its own model version, so Stage 3 must list
     `0.2.0` in `alongside` (with `0.1.0`), or Stage 2's locked table has nothing to read.
   - **Backtest set.** The match histories below let each past match be predicted from only the
     data before it: hundreds of test matches instead of 33, used to judge each v0.3 input before
     release.
   - Per-match team histories (a new `matches` folder in `data/teams/`: date, opponent and rank, LAN or online,
     lineup, vetoes, map scores, halves), collected once by hand and topped up by later research. One
     collection feeds vetoes, recency, opponent strength, lineup period and LAN.
   - Model: recent maps weigh more, map results weighted by opponent strength, only maps with the
     current lineup (roster dates are already in `registry.json`), LAN filter; the cold-start
     penalty and "Underdogs above the market" decisions (below) with all of Stage 1; the Stage 1
     review's proposals.
5. Before the playoffs (Dec 2-9): the Bo5 veto check, the playoffs review, the playoff stage by date
   check (below), then the playoff bracket in the new style (UI PR).
6. After the event: LPDB backtests (the user applies for access), real retuning, CT/T sides in the
   model, round markets; site and chore items under "After the event".

### Other open items

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
- **Check the Stage 2 storylines (Nov 28).** The research refresh fills them on the night of Nov 27
  (its first storyline night with the reworked prompt); read that run.
- **`status.md` lags after a model change.** The poller rewrites `status.md` on every poll but only
  commits it with new results, so a merged change to predictions (e.g. the little-data confidence fix
  on 2026-11-24) or a reordered draw shows up there only after the next result. Commit it on its own
  when the match lines or confidence change (not on simulation noise), or regenerate it in the PR.

- **Poller stage choice by date.** `pickStage` (which stage to poll today, Swiss → Swiss → playoffs) is
  only covered by the live poller; the flow checks call the stage handling directly.

- **Map guesses (user, 2026-11-24).** The veto in `engine/veto.ts` picks the likely map for every
  match, but the site does not show it since the team panel's "Why" was removed, and nothing scores
  it. Stage 1 rounds 1-2 by hand: right map in 2 of 10 matches (chance about 1 in 7). Known cause: a
  map a team never played (Cache) gets offset 0 unless the team has 15+ maps, so the simulated veto
  leaves it in and it often ends up as the guess, while real teams ban it. Options: show per-map
  chances from the simulation, score map guesses on the Track record page, treat an unplayed map as
  a likely ban at smaller samples (changes predictions: ask first). v0.2 (habits) fixed the cause
  from Stage 2; from 2026-11-27 snapshots save each match's map chances for scoring.
  Related, found 2026-11-24: in Bo1 the reason "HEROIC +32 rating on average" (round 3 vs M80) sat
  next to a 49% chance. Not a bug: HEROIC's edge is on Ancient, Inferno and Nuke (62-64%), M80 bans
  those, HEROIC bans its weak maps, and the expected decider Mirage is 50/50. The average over all
  seven maps misleads in a Bo1; the reason could name the likely map's chance first. The bans rest
  on small samples (e.g. HEROIC 3-4 on Mirage, M80 1-4 on Inferno).
- **Underdogs above the market.** In Stage 1 rounds 1-3 the model gave the underdog more than the
  bookmaker in most matches (Market odds page). Either the market is wrong or the model pulls toward
  50% too much (rating uncertainty, the flat VRS prior). Check after Stage 1 on the Track record
  calibration table and the Market odds record; any change goes through `review-stage` (capped).
- **Cold-start penalty (Stage 1 review, decided for v0.3).** Little tier-1 data only widens a team's
  uncertainty; it never lowers its rating. In practice such teams are usually weaker than their VRS
  points say (points won against weak regional teams, no wins against top teams, first Major), and
  the market prices that in: GOSH vs Chinggis Warriors (R3) was 62% model vs 82% market. Evidence so
  far points both ways (Chinggis 0-2, FlyQuest 2-0). After Stage 1 compare the little-data teams'
  predicted and actual results (Chinggis, FlyQuest; DENDELE and Lynn Vision as a check). If they
  clearly underperformed, add a capped rating penalty for cold-start teams in v0.3 (Stage 3). It
  cannot go into Stage 2: its round 1 prediction is saved the moment Stage 1 ends, and changing it
  mid-stage would mix two models in the record.
- **Market pick rule: review again after Stage 2.** Stage 2 keeps the Stage 1 rule (+5 pp, skip
  little data; decided with the user 2026-11-27). Stage 1 had only 16 picks, so check again with
  Stage 2 added (about 30 more): the thresholds (3/5/8/10 pp), Bo1 against Bo3 (Stage 1: Bo1 7-4,
  Bo3 1-4), and Low or coin-flip picks against the rest (Stage 1: 4-5 against 4-3). A new rule
  starts with a new stage; set it in that stage's `marketRule` before its first odds.
  - **Per-confidence split on the Market odds page**, so the record shows which kinds of picks work.
- **Bet slips: later steps.** Built 2026-11-27 (Done below). Open: review the safer/riskier split
  after Stage 2 (Stage 1 replay at margin-free odds: safer 2-1, riskier 0-5, extra 1-0, so riskier
  slips of 2-4 underdogs rarely land); per-slip notes on why a pick was left out.
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

- 2026-11-27: Finished stage polish (user): the status bar reads "Final · Results are final and the
  odds are locked" with the lock time to the nearest quarter hour; the page title drops
  "Finished"; the team panel says "Live rating" and, instead of 100% and dashes, shows the team's
  3-0 / Advance / 0-3 odds from before round 1, coloured by what it meant for the team (3-0 and Advance green ✓ or red ✗; 0-3 red ✗ when it happened, grey when avoided).
- 2026-11-27: A finished stage with locked odds no longer simulates: its table comes from the real
  results and the locked snapshot. Its status bar says "Final" with the lock time (it said "Live"
  for two days after the stage), the bracket key drops the what-if hint, and the team panel labels the rating "now" (the only live number there).
- 2026-11-27: A finished Swiss stage's page locks its odds table: Playoffs and Title show the
  values from the moment the stage ended (the next stage's round 1 snapshot, in the finished
  stage's own model version; Stage 1: v0.1), under "Odds when Stage 1 ended (locked)" with a link to
  the live stage (user's idea). Without that snapshot the page stays live.
- 2026-11-27: Bet slips from Stage 2 (`engine/bet-slips.ts`, `scripts/build-slips.ts`, frozen
  batches in `slips.json`, a slips block per round on the Market odds page). Safer slip: High/Medium
  value picks the model expects to win (chance 50% or more, user's choice 2026-11-27); riskier slip:
  the rest (value underdogs, Low picks at a cautious chance halfway to the market); extra slip for
  overflow; at most 4 picks each; a pick only goes in while it has value at the odds used.
  `log-odds --starts` stores each kickoff, and each reading is a batch of the picks read before
  their match starts. Real payouts come from the local odds through the dev server only; a built
  site shows margin-free odds. Slip rule per stage in `marketRule.slips` (none for Stage 1).
- 2026-11-27: Value-pick rule stored per stage (`marketRule` in the event config, with an optional
  note shown above the stage's record); Stage 1 frozen at +5 pp, skip little data, and labelled
  "Stage 1 used Model v0.1 (value-pick rule)". `npm run validate` refuses a stage with odds but no
  rule. Stage 1 pick review (16 picks, 8-8, +3.06 units at margin-free odds; model and market Brier
  level at 0.247 and 0.249 over 33 matches): 3 pp 9-9 +2.56, 8 pp 4-5 −0.35, 10 pp 1-3 −2.22; no
  variant clearly better on 16 picks, so Stage 2 keeps the same rule.
- 2026-11-27: Snapshots save each match's map chances per map slot (`maps`), for scoring map
  guesses on the Track record page from Stage 2 on. Match and team odds unchanged.
- 2026-11-26: Track record page names each stage's model version next to its title and, from
  Stage 2, adds a "New model vs old" table: the official version and the one scored alongside on the
  same matches (Brier, favourite won, Bo1 map guessed from the saved map chances).
- 2026-11-26: Announced Swiss draws. The poller stores each round's full draw (round 2 on) in
  `draw.json` in the event folder; the Stage, Pick'Em and Playoffs pages and `simulate.ts` use it for
  the current round, so a Valve draw that differs from the engine's pairing shows the right pairs.
  A round's snapshot waits for the full draw, and if the page never lists it before the round's first
  results, it is saved just before they are written (the results' pairs complete the draw).
- 2026-11-26: Stage 1 replay with all of round 4 (30 matches;
  `scripts/replay-stage.ts pgl-major-singapore-2026 stage-1 0.1.0 0.2.0`, run 2026-11-26 on main
  a209137): maps actually played got 24.8% (v0.1.0: 10.1%), Bo1 top map 10/20 (2/20), Brier 0.227
  (0.233), hits 18/30 (19/30). Same picture as the 26-match replay v0.2.0 was chosen on
  (`docs/model.md`).
- 2026-11-26: The poller saves CT/T regulation rounds and team A's first side per map
  (`maps[].sides` in `results.json`, from Liquipedia's half scores) for later use (round markets,
  side strength); the model does not read them yet.
- 2026-11-26: Model v0.2.0 for Stage 2 on (Stage 1 stays v0.1.0, which is scored alongside from
  Stage 2): the veto uses each team's real ban and pick shares from HLTV (`data/teams/vetoes/`, 31
  teams, window ending before Stage 1). Stage 1 replay: maps actually played got 24.6% (v0.1.0:
  10.0%, random 14%), Bo1 top map 10/20 (2/20), Brier 0.242 (0.249). Model versions per stage, the
  alongside snapshots and `replay-stage.ts` came with it. Confidence labels unchanged: 26 matches are
  too few to retune them (Medium 4/11 hits, Low 8/12).
- 2026-11-26: Research refresh checked after its first run with the reworked prompt (2026-11-25):
  all 22 teams, 24 searches, about a minute; no news after the team files' dates, nothing changed.
- 2026-11-26: Bracket marks the selected team with a soft orange row background (no underline),
  so short names (CW) stand out too; a what-if win has a dashed orange outline instead of the tint.
- 2026-11-26: Probabilities table marks finished teams: a team with enough wins to advance has a
  bold name and Advance chance, an eliminated team's row is grey. Other Advance chances are no
  longer bold.
- 2026-11-25: Exact match odds. Each upcoming match's chance is now computed exactly over every
  possible veto instead of counted from 12,000 runs, and announced pairings in another order are
  simulated in the rules' order. The Stage page, snapshots and `status.md` now show the same numbers
  (R4 had Wildcard 66.4% in the snapshot vs 66.7% on the Stage page; exact: 66.1%).
- 2026-11-25: Market odds: the site no longer names the bookmaker (prices are labelled "pre-match"
  or "closing avg"), and `log-odds` also saves the decimal odds to a git-ignored local file for real
  bet slip payouts (never committed or published).
- 2026-11-25: Market odds page: the Pick column is now "Value pick", with one plain line saying a
  value pick can be the underdog (picked for the price, not because it is expected to win), and the
  record adds Units: the profit from 1 unit on every pick at the margin-free odds. No pick changed.
- 2026-11-25: Market odds page: the source note under the rounds is gone (each round still names
  its source in its heading).
- 2026-11-25: Team panel outlook (3-0, Advance, 0-3): each label and number is centred in its
  third instead of left-aligned.
- 2026-11-25: Below 1024 px the team panel keeps its desktop width (340 px per column) and is
  centred above the bracket and table, so its text never stretches across the page. Its two
  columns (768-1023 px) are 64 px apart, so match history reads as a separate section.
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
