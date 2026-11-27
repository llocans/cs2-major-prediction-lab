# CS2 Major Prediction Lab

Probabilistic predictions for Counter-Strike 2 Majors. Team ratings and map strengths are built from
public match data, each match is simulated map by map through the event's real veto, and whole stages
are run as a Monte Carlo. Predictions are saved before every round and scored afterwards, so the track
record is honest and visible.

The site is a static React app that reads the data in this repository. The current event and its latest
odds are in [`data/events/<event>/status.md`](data/events/), which the scripts regenerate after every
result.

## How a prediction is made

1. **Ratings.** Each team starts from a prior derived from Valve's Regional Standings (VRS) and carries
   an uncertainty. Teams with little tier-1 history start with a wider one, which pulls their odds
   toward 50%.
2. **Map strengths.** Per-map offsets from recent map results, shrunk toward the team's overall rate
   when samples are small.
3. **Veto.** Each match follows the event's pick/ban procedure from its config; teams ban weak maps and
   pick strong ones, with some randomness.
4. **Simulation.** The rest of the stage is played out thousands of times with seeded randomness,
   following Valve's Swiss pairing rules. Outputs include advance, 3-0 and 0-3 odds per team and a win
   probability per match. Each run then continues through the remaining stages and the playoffs, which
   gives every team's odds of reaching the playoffs and winning the event.
5. **Updates.** Every real result updates the ratings, and the stage is re-simulated from the actual
   standings.
6. **Scoring.** Each round's saved snapshot is compared with what happened: Brier score, calibration,
   upsets, and how often the favourite won, against a coin-flip baseline.

Human judgment (a roster change, a stand-in, visa problems) enters only through
[`data/model/modifiers.json`](data/model/modifiers.json): every entry is capped in size, sourced, and
has an expiry date. Nothing else adjusts a prediction by hand.

The full specification is in [`docs/model.md`](docs/model.md) and the principles behind it in
[`docs/core/model-principles.md`](docs/core/model-principles.md).

## Getting started

Requires Node.js 24 or later (scripts are TypeScript run directly by Node, without a build step).

```bash
npm ci
npm run dev        # site at http://localhost:5173
```

Other commands:

| Command                                    | What it does                                       |
| ------------------------------------------ | -------------------------------------------------- |
| `npm run check`                            | Typecheck, lint and tests                          |
| `npm run validate`                         | Validate every data file against its schema        |
| `npm run build`                            | Build the static site into `dist/`                 |
| `npm run ui-audit`                         | Measure every page in Chromium (desktop + mobile, light + dark); needs `npx playwright install chromium` once |
| `node scripts/simulate.ts <event> <stage>` | Print the current odds for a stage or the playoffs (`--model <version>` for another model version) |
| `node scripts/replay-stage.ts <event> <stage> [version ...]` | Replay a stage's saved rounds with each model version and score them |
| `node scripts/log-odds.ts <event> <stage> <round> ...` | Log a round's bookmaker odds (margin removed) for the Market odds page |

Scripts that fetch from Liquipedia need a contact address for the API User-Agent. Copy `.env.example`
to `.env` and fill in `LIQUIPEDIA_CONTACT`. Market odds (a benchmark, never a model input) are optional:
with a free OddsPapi key in `ODDSPAPI_KEY` and the ids from `scripts/research/oddspapi-setup.ts` in the
event config, the poller adds each match's closing line. Viewing the site and running simulations need
nothing.

## Repository layout

| Path                | Contents                                                                       |
| ------------------- | ------------------------------------------------------------------------------ |
| `engine/`           | Pure TypeScript: Swiss pairing, playoffs, veto, ratings, simulation, scoring   |
| `scripts/`          | Everything with side effects: fetching, logging results, snapshots, validation |
| `site/`             | React + Vite + Tailwind static site; runs the engine in a Web Worker           |
| `data/schemas/`     | Zod schemas for every data file                                                |
| `data/teams/`       | Team registry (IDs, aliases, dated rosters) and one research note per team     |
| `data/ratings/`     | Current ratings and their history                                              |
| `data/model/`       | Model parameters and judgment modifiers                                        |
| `data/events/<id>/` | Event config, teams, real results, announced Swiss draws, round snapshots, market and bookmaker odds, accuracy, generated status |
| `docs/`             | Rules, model spec, sources, automation, changelog, roadmap                     |

The engine never touches files, the network or the UI; scripts and the site are the only places with
side effects. Data is plain JSON and Markdown validated at every boundary, so the repository itself is
the database and its history is the audit log.

## Data rules

- **No invented numbers.** Every fact and derived number carries a source and a date.
- **Real results only** in `results.json`. Snapshots are never edited after they are saved.
- **What-if results** set in the site (forced winners) live only in the page URL, so they
  can be shared as a link and never write to the data.
- **Bookmaker odds** on the Market odds page are committed as margin-free percentages only; the
  bookmaker's own decimal odds stay in a git-ignored local file and are never published. The model never reads them; its value picks there follow a fixed rule set per stage in the event config
  (`marketRule`: a minimum edge over the market, so a pick can be the underdog; a later change never
  rewrites a finished stage's record), scored in won, lost and units at the margin-free odds. From
  Stage 2 the picks are also combined into bet slips (a safer and a riskier one per round), frozen in
  `slips.json` when the odds are read; real payouts show only on the computer that holds the local
  odds.
- **Pick'Em picks** made on the site's Pick'Em page stay in the viewer's browser (local storage) and
  never write to the data.

## Automation

While a stage is running, a GitHub Actions workflow (`.github/workflows/poll.yml`) checks Liquipedia
every 15 minutes, around the clock. New results are logged, ratings updated, the stage re-simulated, the next round's snapshot
saved, and advancing teams seeded into the next stage. Each run commits only data and a changelog line
to `main`. Research refreshes, stage reviews and a weekly data and docs checkup run as scheduled Claude Code
tasks.

Details, schedules and the local fallback are in [`docs/automation.md`](docs/automation.md); every
automatic change is logged in [`docs/changelog.md`](docs/changelog.md).

## Adding an event

Formats live in config, not code. A new event needs a folder under `data/events/<id>/` with:

- `config.json`: map pool, veto procedures and stages (format, dates, Bo1/Bo3 rules), each with a source
- `teams.json`: the participating teams and their seeds

Then run the research scripts to build rosters, form and map data, `scripts/build-ratings.ts` for the
starting ratings, and `scripts/snapshot.ts` before the first round. The rules each config value encodes
are documented with sources in [`docs/rules.md`](docs/rules.md).

## Current limitations

- The Bo5 grand-final veto is assumed from earlier PGL events until PGL publishes the Singapore one.
- Market odds for the current Major are read by hand: CSGOEmpire before a round when someone has
  time, OddsPortal's closing line (about 10 bookmakers averaged) after it. The site shows the pre-match
  odds where logged, otherwise the closing line, and labels which kind it is; the track record uses
  OddsPortal.
  OddsPapi does not cover this Major past its first round, and CSGOEmpire's terms forbid automated
  reading.
- Ratings are tuned on reasoning, not yet on backtests of past Majors.
- The team, matchup and odds-over-time pages are placeholders.
- The site runs locally; it is not hosted anywhere yet.

What is planned next is in [`docs/roadmap.md`](docs/roadmap.md).

## Contributing

Conventional commits, small and focused. Data updates from scripts go straight to `main` after checks;
code, docs and model parameter changes go through a pull request with `npm run check` passing. Files in
`docs/core/` change only on a `core/*` branch.

## Sources and licence

Match data comes from [Liquipedia](https://liquipedia.net/counterstrike/) (CC BY-SA 3.0), used through
its API within the published rate limits, and Valve's
[Regional Standings](https://github.com/ValveSoftware/counter-strike_regional_standings) and
[Major rulebook](https://github.com/ValveSoftware/counter-strike_rules_and_regs). Every source used is
listed in [`docs/sources.md`](docs/sources.md) and cited next to the facts it supports.

Not affiliated with Valve, PGL, Liquipedia or any team.

Code is released under the [MIT licence](LICENSE). The data in `data/` is released under
[CC BY-SA 4.0](data/LICENSE.md), as required by the share-alike terms of the Liquipedia content it
adapts.

Team logos in `site/public/logos/` are trademarks of their teams, taken from Liquipedia's team
templates (`scripts/research/team-logos.ts`) and shown only to identify the teams. Neither licence
above covers them.
