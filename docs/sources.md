# Sources

Checked 2026-11-21 from this machine (Claude desktop app).

| #   | Source                                                               | Use                                                     | Access                                                                       |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | HLTV.org                                                             | Results, map stats, player ratings, H2H, rankings, odds | **Interactive only**, Browser pane (web fetch: 403). Never in scheduled runs |
| 2   | Liquipedia                                                           | Brackets, roster history, results                       | **MediaWiki API only** for automation (rules below)                          |
| 3   | bo3.gg                                                               | Detailed match and map stats                            | **Interactive only**, Browser pane (fetch returns an empty JS shell)         |
| 4   | Valve Regional Standings                                             | VRS points and rosters (rating prior)                   | `gh api repos/ValveSoftware/counter-strike_regional_standings`               |
| 5   | Valve rules repo                                                     | Major rules                                             | `gh api repos/ValveSoftware/counter-strike_rules_and_regs`                   |
| 6   | PGL (pglesports.com)                                                 | Official schedule, bracket, rules                       | Browser pane only (fetch: JS shell). pgl.gg: Cloudflare 525                  |
| 7   | News: Dust2.us, Sheep Esports, Dexerto, Dot Esports, pley.gg, Strafe | Rosters, interviews                                     | Web fetch                                                                    |

## Liquipedia API rules (automation)

- Endpoint: `https://liquipedia.net/counterstrike/api.php`. No automated access to rendered HTML pages.
- At most 1 request every 2 seconds; `action=parse` at most 1 every 30 seconds (we use
  `action=query&prop=revisions` instead, so parse is not needed).
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
