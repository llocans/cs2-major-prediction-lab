# Sources

Checked 2026-11-21 from this machine (Claude desktop app).

| #   | Source                                                               | Use                                                     | Access                                                                       |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | HLTV.org                                                             | Results, map stats, player ratings, H2H, rankings, odds | **Interactive only**. Stats pages: Claude in Chrome (the built-in Browser pane loops on Cloudflare's check). Web fetch: 403. Never in scheduled runs |
| 2   | Liquipedia                                                           | Brackets, roster history, results                       | **MediaWiki API only** for automation (rules below)                          |
| 3   | bo3.gg                                                               | Detailed match and map stats                            | **Interactive only**, Browser pane (fetch returns an empty JS shell)         |
| 4   | Valve Regional Standings                                             | VRS points and rosters (rating prior)                   | `gh api repos/ValveSoftware/counter-strike_regional_standings`               |
| 5   | Valve rules repo                                                     | Major rules                                             | `gh api repos/ValveSoftware/counter-strike_rules_and_regs`                   |
| 6   | PGL (pglesports.com)                                                 | Official schedule, bracket, rules                       | Browser pane only (fetch: JS shell). pgl.gg: Cloudflare 525                  |
| 7   | News: Dust2.us, Sheep Esports, Dexerto, Dot Esports, pley.gg, Strafe | Rosters, interviews                                     | Web fetch                                                                    |
| 8   | OddsPortal                                                           | Market odds (benchmark only)                            | **Interactive only**, Browser pane: decline cookies, open each match by clicking it on the event page (direct match URLs render no odds) |
| 9   | OddsPapi (oddspapi.io)                                               | Market odds, automatic (benchmark only)                 | REST API, free plan, key `ODDSPAPI_KEY`; poller only, at most every 2 h       |

### Market odds (benchmarks.json)

**Automatic:** the poller, at most every two hours and only when a result from
the last two days has no benchmark, reads the event's settled fixtures from OddsPapi (1 request of the
free plan's monthly allowance) and each new match's historical odds (free of quota). The closing line
is each bookmaker's last price before the start (`trueStartTime`, else `startTime`); margin removed per
bookmaker, then the mean. Only `pA` and the fixture id are stored, never the raw prices (the terms
forbid redistributing their data "as a standalone product": [terms](https://oddspapi.io/legal/terms),
read 2026-11-23). Setup per event: `scripts/research/oddspapi-setup.ts`
prints the tournament id and market ids for `marketOdds` in `config.json`.
For PGL Singapore it finds nothing: OddsPapi marks its 8 round 1 fixtures as cancelled with no odds
and lists none after them (checked 2026-11-24), so this event's odds are read by hand.

**By hand (Stage 1 round 1 on; Browser pane only):**

Before a round, or after a match from OddsPortal's final listed odds (its last prices before the
start), read every bookmaker listed on each match's OddsPortal page. Per bookmaker,
`p = (1/oddsA) / (1/oddsA + 1/oddsB)` removes its margin; `pA` is the mean over bookmakers. The
source names the bookmaker count, the match URL and which of the two it was; `observedAt` is the
time of reading. Never in-play odds.

## Liquipedia API rules (automation)

- Endpoint: `https://liquipedia.net/counterstrike/api.php`. No automated access to rendered HTML pages.
- On a 429 or 503: one retry after `Retry-After` (10-90 s), then give up until the next check.
- At most 1 request every 2 seconds; `action=parse` at most 1 every 30 seconds (we use
  `action=query&prop=revisions` instead, so parse is not needed). One exception, never automated:
  `research/short-names.ts` makes a single `action=expandtemplates` call for all teams' `TeamShort`
  templates (Liquipedia keeps team short names in an extension that `query` cannot read).
- User-Agent: `cs2-major-prediction-lab/<version> (<contact>)`, contact from `LIQUIPEDIA_CONTACT` in `.env`.
- gzip enabled (`Accept-Encoding: gzip`). Responses cached in `.cache/liquipedia/` keyed by title and revid;
  the poller skips the content fetch when the revid is unchanged.
- Content is CC-BY-SA 3.0: keep the source on every record; credit Liquipedia on the public site.
- LPDB API (structured data) needs approval and a key. Not applied for yet; reconsider when building
  backtests on past Majors.

## Rules

- If a source is unreachable, say so and use the next one. Never invent stats.
- Always verify current facts. Never rely on memory for rosters or results.
- Market odds are a benchmark only, never a model input.

## How map stats were collected (2026-11-21)
In the user's Chrome (Claude in Chrome), the HLTV team map-stats pages with `rankingFilter=Top50` and a
3-month window were read for each team (one request every 1.5 s), reduced to map W-L counts and imported
with `scripts/research/import-map-stats.ts`. Only the derived counts are stored, each with its URL.
