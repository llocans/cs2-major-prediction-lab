# Model spec (v0.1.0)

Principles: `docs/core/model-principles.md`. Parameters: `data/model/params.json`. Code: `engine/`.

## Ratings

Each team has a map-level rating `r` and an uncertainty `rd` (Glicko-style), on a logistic scale where
400 points = 10:1 odds (`params.scale`, the same scale Valve's VRS uses: `model/glicko.js` in the
standings repo, "rank delta of 400 points = 90% chance of victory").

### Prior (cold start)

`r = base + perVrsPoint × (vrsPoints − vrsCenter)`

VRS points are a _series_-level Elo (Valve runs Glicko with a fixed RD of 75, i.e. Elo). For a Bo3, the
series win probability `P = p²(3 − 2p)` has slope 1.5 at p = 0.5, so a map-level gap is about 1/1.5 ≈ 0.67
of the series gap. We use `perVrsPoint = 0.6` (slightly flatter, because VRS also rewards factors that are
not strength). `rd = prior.rd` (60). Teams with fewer than `coldStartSeries` (8) series against VRS
top-50 teams in the last 6 months (from Valve's VRS match tables) get `coldStartRd` (110). With the
2026-11-02 VRS data that is Chinggis Warriors (0) and FlyQuest (7); DENDELE (30) and Lynn Vision (16) have
enough tier-1 series.

### Map strength

Per team and map, an `offset` from the team rating, with its own `rd` and sample size `n`:

- From research: maps won `won_m` of `n` played on the map, and the overall map win rate `w` in the same
  window. The map rate is shrunk toward `w` with `shrinkMaps` pseudo-maps:
  `w_m = (won_m + shrinkMaps·w) / (n + shrinkMaps)`
- `offset = 400·log10(w_m/(1−w_m)) − 400·log10(w/(1−w))`, clamped to ±`maxOffset`.
- `rd_map = newMapRd × sqrt(shrinkMaps / (n + shrinkMaps))`. A map with no data (Cache) has offset 0 and
  `rd_map = newMapRd` (80: roughly the spread of real map offsets, so missing data widens, but does not
  flatten, predictions).
- A map with no games at all in a sample of at least `unplayedMinMaps` (15) maps is most likely the
  team's permanent ban: offset `−unplayedPenalty` (−40) with `rd_map = newMapRd`. Smaller samples say
  nothing, so those maps stay at 0.
- Modifiers (`data/model/modifiers.json`) add `delta` to a team (or one map), clamped to
  ±`modifiers.maxAbs`, and only until `expires`.

### Map win probability

`Δ = (r_A + off_A,m + mod_A) − (r_B + off_B,m + mod_B)`
`g = 1 / sqrt(1 + 3q²·σ²/π²)` with `q = ln10/400` and `σ² = rd_A² + rd_B² + rd_A,m² + rd_B,m²`
`p = 1 / (1 + 10^(−g·Δ/400))`

Uncertainty therefore pulls predictions toward 50% (cold-start teams, new maps).

### Teams joining later stages
Invited teams of Stages 2 and 3 get the same VRS prior. Once an event has results,
`scripts/build-ratings.ts` only adds teams missing from `current.json` and keeps every existing rating
(`--force` rebuilds everything from the prior).

## Veto model

Follows the exact steps in event config (`veto.bo1`, `veto.bo3`). Each team values a map by its own
advantage `Δ_m`. On a ban it removes a low-advantage map, on a pick it takes a high-advantage map, by
softmax with `veto.temperature` (25 rating points) so the veto is not perfectly predictable. The higher
seed chooses Team A or B by evaluating both options greedily and taking the better one. Sides are not
modeled. The remaining map is the decider.

**Ban and pick habits (v0.2.0 on).** With `veto.habits`, each step mixes that softmax with the team's
real habit: its HLTV "Ban %" or "Pick %" per map (`data/teams/vetoes/`, the same page and window as
the map stats). The chance of map `m` is `(1 − w)·softmax_m + w·share_m / Σ share` over the
remaining maps, with `w = habits.weight × n / (n + habits.shrinkMaps)` for a team with `n` maps in the
window. A map the team never played counts as a full ban share (100) and no pick share; a team
without veto data (FlyQuest) uses strength alone. v0.2.0: `weight` 1, `shrinkMaps` 5 (58 maps →
w = 0.92, 6 maps → 0.55). Chosen on the Stage 1 replay (rounds 1-4, 26 matches; the habit window ends
before Stage 1): the chance given to the maps actually played rose from 10.0% (v0.1.0) to 25.4%
(random: 14%), the Bo1 top map from 2/20 to 10/20, Brier from 0.249 to 0.242. Every stronger setting
tried improved both steadily (weights 0.3-1, shrink 1-20), so this is a trend, not a lucky value.

## Rating updates (after each real match)

Per map played, with `E` = expected map win probability and `s` = 1 or 0. `E` uses the same
strengths as the prediction, including the modifiers active on the match day, so a result is judged
against what was actually predicted (modifiers themselves are never changed by results):

- Margin factor `mult = 1 + roundDiffWeight × (min(|roundDiff|, 13)/13 − 0.5)` (0.75..1.25 by default).
- `K = k × formatWeight[format] × mult × (rd / prior.rd)²`; Bo1 maps count `0.75`, Bo3/Bo5 maps `1`.
- `r += K × (s − E)`; map offset `+= 0.5 × K × (s − E) × (rd_map/newMapRd)²`, `n += 1`, `rd_map` recomputed.
- `rd = max(minRd, 1/sqrt(1/rd² + q²·g²·E(1−E)))`.

## Simulation

Monte Carlo over the rest of the stage from the real results: `sim.runs` = 12,000 runs, seeded
(`sim.seed`). 10,000 runs would give a worst-case standard error of exactly 0.50 pp (at p = 0.5); 12,000
gives 0.46 pp, under the 0.5 pp target. Each run pairs rounds with the Valve rules, picks the format per
match, runs the veto, and plays map by map.

Outputs per team: P(3-0), P(advance), P(0-3), P(eliminated), simulated; per known match: P(team A
wins), **exact**, not counted from the runs. `seriesWinChance` (`engine/series.ts`) takes the same veto
roles as a run, walks every veto the softmax veto can produce with its probability (`vetoOutcomes` in
`engine/veto.ts`; at most 7·6·5·4·3·2 = 5,040 paths), and sums the series chance over them. So match
odds carry no sampling noise, and a page that re-simulates (the Stage page in the browser) shows the
same match odds as the saved snapshot. The standard error covers the team odds only. Before
2026-11-25 match odds were counted from the runs (±0.4 pp); Stage 1's R1-R4 snapshots keep those
numbers (snapshots are never edited).

Map win probabilities are always computed in one fixed team order (alphabetical) and the other order
is `1 − p`, so a simulation never depends on which pairing happened to be evaluated first. The same
goes for the order of a round's matches: announced pairings that are the Valve rules' pairings listed
in another order (a Liquipedia page) are simulated in the rules' order, so the poller's snapshot and
the site's own run draw the same random numbers and give the same team odds.

### Whole event (playoff and title odds)

`engine/simulate-event.ts`, chain built from config by `engine/event-chain.ts`. In every run of the
current stage, the stage's 8 advancing teams (final mid-stage seed order) become seeds 9-16 of the next
stage (via `advanceTo`), behind its directly invited teams (seeds 1-8, pre-event seed order); that stage
is played from round 1, and so on; the last Swiss stage's 8 advancing teams are the playoff seeds.
Outputs per team in the event: P(playoffs), P(title). The later stages draw from a second random stream
(`sim.seed` xor a constant), so the current stage's odds are exactly those of the stage-only simulation.
Title odds are left out when a playoff format has no veto procedure in config. Formats whose veto is
`unverified` are reported with the odds (UI note, `snapshot.unverifiedVeto`).

Cost: about 7 s for 12,000 runs from Stage 1 (three Swiss stages and the playoffs per run), less later.

### Playoffs

`engine/playoffs/`. Single elimination from the event config: round-1 pairs of seeds (`bracket`, in
bracket order: winners of pairs 1 and 2 meet, then 3 and 4), `format.default` for every match except
the final (`format.final`) and the third-place match (`format.thirdPlace`, when `thirdPlaceDecider`).
Seeds are the final Stage 3 mid-stage seed order (Valve). In every match the higher seed is Team A
for the veto-role choice, as in the Swiss stages; matches are played map by map through the same
veto and series code. Real results are matched to bracket slots by pair (a pair meets at most once),
and a result that fits no slot is an error. The Monte Carlo uses the same `sim.runs` and seed.

Outputs per team: P(semifinal), P(final), P(title), P(third place, when there is a decider); per
match with both teams known: P(higher seed wins).

The Bo5 grand-final veto is unverified for PGL Singapore (`veto.bo5.unverified`; see `docs/rules.md`).

## Confidence and reasons

- Match confidence from `σ` (combined rd) and `|p − 0.5|`: **high** if σ < 110 and |p − 0.5| ≥ 0.15;
  **low** if σ ≥ 150 or |p − 0.5| < 0.05, or if either team has little tier-1 data (rd ≥ 100: one
  team's solid data must not hide the other's lack of it); otherwise **medium**. The Market odds page
  reads older snapshots with the same rule.
- Reasons name the largest contributors: rating gap, the expected maps from the veto, active modifiers,
  and uncertainty.

## Scoring and retuning
- `engine/track-record.ts` compares each round's snapshot with the results: hit or miss, upsets (the
  winner had under 40%), Brier per match and round, calibration, and pre-stage advance odds once the
  stage is complete. The Track record page (`#/track-record`) and `scripts/score-stage.ts` both use it.

- Per stage: Brier score of match predictions, calibration in 10-point bins, compared with "higher VRS
  wins", 50/50 and the market benchmark. Written to `data/events/<id>/accuracy.md`.
- Retune cap: after one stage, no weight in `params.json` may change by more than
  `retuneCapPerStage` (10%) of its value. Larger changes need backtests on past Majors. All parameter
  changes go through a PR.

## Model versions

Each stage runs on one model version and may score older versions next to it on the same matches
(`docs/core/model-principles.md`, rule 7: a new input starts with a new stage, next to the old
version). Stage 1 of PGL Singapore is the test run of v0.1.0.

- `data/model/params.json` is the latest version; `data/model/archive/<version>.json` keeps every
  older version a stage still runs on or scores alongside. The event config names them per stage:
  `"model": { "version": "0.2.0", "alongside": ["0.1.0"] }` (no `model`: the latest).
- The poller, `simulate.ts` and the site's in-browser simulation all use the stage's own version.
  An alongside version gets its own pre-round snapshots in
  `data/events/<id>/snapshots/alongside/<version>/` (same schema, saved at the same moment, never
  edited), so both are scored on the same results. `simulate.ts <event> <stage> --model <version>`
  prints an alongside version's odds.
- Versions that run together share `data/ratings/current.json`, so they must rate teams the same
  way (scale, prior, maps and update rules; `engine/model-version.ts` refuses otherwise). They may
  differ in everything that turns ratings into a prediction: veto, simulation, confidence. A
  version with new rating rules needs its own ratings file first (not built yet), and
  `build-ratings.ts` always builds the prior with the latest `params.json`.
- Alongside snapshots are not on the site or in `score-stage.ts` yet (the Track record step in
  `docs/roadmap.md`). An alongside snapshot that fails is reported and skipped; it never stops
  the poller.
- `node scripts/replay-stage.ts <event> <stage> [version ...]` replays a stage's saved rounds with
  each version, from the ratings, earlier results, modifiers and draw each snapshot had, and scores
  them: Brier, hits, the mean chance the veto gave the maps actually played, and the Bo1 top map.
  Replaying the version a snapshot was made with gives its numbers back (Stage 1, v0.1.0: same
  Brier and hits, match odds within 1.2 pp because rounds 1-4 counted match odds from the runs).

Releasing a version: copy `params.json` to `archive/<old version>.json`, change `params.json` and
bump its `version`, set the next stage's `model` to the new version with the old one alongside, run
the replay on the finished stages, and merge before the previous stage's last match ends (the
next stage's round 1 snapshot is saved the moment it finishes).
