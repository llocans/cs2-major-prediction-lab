# Automation

Nothing that fetches or updates data needs the laptop: results run on GitHub Actions, Claude judgment
tasks run as Claude cloud scheduled tasks. The Mac is only for viewing the site and interactive HLTV
research.

## 1. Results poller: GitHub Actions (no Claude usage)

`.github/workflows/poll.yml` runs `scripts/poll-liquipedia.ts <event> --commit` every 15 minutes,
03:00-17:59 UTC (11:00-01:59 Singapore) in November and December, plus a manual "Run workflow" button.

- Each run: fresh checkout of main, `npm ci`, read the current stage page from the Liquipedia API, log
  new results, update ratings, re-simulate, save the next-round snapshot, move advancing teams on when a
  stage ends, validate everything, commit only `data/` and `docs/changelog.md` to main, push.
- Pushes rebase onto newer commits (e.g. from a cloud Claude task) and retry up to 3 times; a rebase
  conflict is aborted and the run fails (GitHub emails the repo owner on failed runs).
- One run at a time (`concurrency: poll`); a late run waits.
- Secret: `LIQUIPEDIA_CONTACT` (repository secret, never in the repo).
- Status: each run force-pushes one file, `sync-status.json`, to the `poll-status` branch (checked at,
  outcome, revision, last change or error). Main gets no "still alive" commits.
- Cost: well under GitHub Free's 2,000 Actions minutes per month (unlimited once the repo is public).
- GitHub may start scheduled runs 5-15 minutes late.

### Local sync on the Mac (optional)
`node scripts/install-launchd.ts pull` installs a launchd job that every 10 minutes fast-forwards main
(only if the checkout is on main with no local changes) and mirrors `poll-status` into
`.cache/sync-status.json`. The stage page's status bar reads it:

| Word | Meaning |
|---|---|
| **Waiting** | No stage running yet (checks start the day before) or the stage is finished |
| **Live** | A check reached this computer within 45 minutes; shows when, and the next check |
| **Problem** | The last check failed, or no update for 45+ minutes during a stage |

The local poller (`install-launchd.ts poll <event> [--commit]`) is a fallback only. Never run it with
`--commit` next to the cloud poller.

## 2. Claude judgment tasks: Claude cloud scheduled tasks

Run on Anthropic's machines from a fresh clone of the repo; they use subscription usage like any
session. Each prompt runs one skill and pushes data straight to main (the cloud default would be a
`claude/` branch, which the poller would never see).

| Task | Skill | When (UTC) | Model |
|---|---|---|---|
| research refresh | `research-team` (teams still in the event, news only, no HLTV) | daily 21:00, Nov 22 - Dec 12 | Sonnet, medium |
| stage reviews | `review-stage` | 18:00 on Nov 27, Dec 1, Dec 6 | Sonnet, high |
| cleanup | `cleanup` | Sundays 18:30 | Sonnet, low |

All run outside the poller's 03:00-17:59 UTC window, so their pushes do not collide with results.
Each prompt keeps its guardrails (date window, "already done", stage complete).

## 3. Hooks (`.claude/settings.json`)

| Hook                    | Script                                                                                                 | Status  |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ------- |
| PreToolUse Edit\|Write  | `guard-edits.ts`: deny docs/core edits on main, deny edits to saved snapshots                          | active  |
| PostToolUse Edit\|Write | `validate-data.ts`: validate edited data files against their schema                                    | active  |
| Stop | `stop-check.ts`: `npm run check` only if code changed since the last pass; blocks on failure, reports after 3 attempts (built-in cap is 8) | active |
| SessionStart | `session-start.ts`: print the newest `data/events/<id>/status.md` | active |

## Headless fallback

`claude -p` only if needed. Never `--bare` (it skips the subscription login). Use
`--permission-mode auto --permission-prompts none --allowedTools ...`. Project hooks run there too.
