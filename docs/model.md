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

## Rating updates (after each real match)

Per map played, with `E` = expected map win probability and `s` = 1 or 0:

- Margin factor `mult = 1 + roundDiffWeight × (min(|roundDiff|, 13)/13 − 0.5)` (0.75..1.25 by default).
- `K = k × formatWeight[format] × mult × (rd / prior.rd)²`; Bo1 maps count `0.75`, Bo3/Bo5 maps `1`.
- `r += K × (s − E)`; map offset `+= 0.5 × K × (s − E) × (rd_map/newMapRd)²`, `n += 1`, `rd_map` recomputed.
- `rd = max(minRd, 1/sqrt(1/rd² + q²·g²·E(1−E)))`.

## Simulation

Monte Carlo over the rest of the stage from the real results: `sim.runs` = 12,000 runs, seeded
(`sim.seed`). 10,000 runs would give a worst-case standard error of exactly 0.50 pp (at p = 0.5); 12,000
gives 0.46 pp, under the 0.5 pp target. Each run pairs rounds with the Valve rules, picks the format per
match, runs the veto, and plays map by map.

Outputs per team: P(3-0), P(advance), P(0-3), P(eliminated); per known match: P(team A wins).

## Confidence and reasons

- Match confidence from `σ` (combined rd) and `|p − 0.5|`: **high** if σ < 110 and |p − 0.5| ≥ 0.15;
  **low** if σ ≥ 150 or |p − 0.5| < 0.05; otherwise **medium**.
- Reasons name the largest contributors: rating gap, the expected maps from the veto, active modifiers,
  and uncertainty.

## Scoring and retuning

- Per stage: Brier score of match predictions, calibration in 10-point bins, compared with "higher VRS
  wins", 50/50 and the market benchmark. Written to `data/events/<id>/accuracy.md`.
- Retune cap: after one stage, no weight in `params.json` may change by more than
  `retuneCapPerStage` (10%) of its value. Larger changes need backtests on past Majors. All parameter
  changes go through a PR.
