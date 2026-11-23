# Automation

Nothing that fetches or updates data needs the laptop: results run on GitHub Actions, Claude judgment
tasks run as Claude cloud scheduled tasks. The Mac is only for viewing the site and interactive HLTV
research.

## 1. Results poller: GitHub Actions (no Claude usage)

`.github/workflows/poll.yml` runs `scripts/poll-liquipedia.ts <event> --commit` every 15 minutes,
around the clock, while a stage is running (its dates ±1 day).

GitHub drops many scheduled runs (on 2026-11-22 it started 1 of ~34), so the schedule is not the
clock. It only starts a chain:

- **Starters:** the schedule fires at :07, :27 and :47 every hour in November and December. A `gate` job
  checks for an active or queued poll run and, if there is one, ends in seconds.
- **Chain:** one run (`.github/poll-loop.sh`) polls at :02, :17, :32 and :47 for up to 5.5 hours, then
  starts its successor with `workflow_dispatch` (`chain=true`, which skips the gate). Long runs cost
  nothing because the repository is public.
- **Event window:** idle checks (no stage running today) keep the chain alive from 3 days before any
  stage to 1 day after it (`scripts/event-window.ts`). For PGL Singapore that is Nov 21 - Dec 14
  without a break, so stage changes never wait for a starter. After the window the run ends without a
  successor. If a run dies, the next starter that fires restarts the chain.
- **Manual:** "Run workflow" starts a chain only if none is running. An optional stage id applies to
  that run only; once that stage has nothing left to poll, the run switches to the stage by date, and
  successors never inherit it.

Each check inside a run:

- Reset to the latest main (picks up cloud Claude pushes and merged code; reinstalls if
  `package-lock.json` changed), read the current stage page from the Liquipedia API (Swiss: Matchlists;
  playoffs: the Bracket template, once Stage 3 has advanced its 8 teams), log new results,
  update ratings, re-simulate, save the next-round snapshot, move advancing teams on when a stage ends,
  validate everything, commit only `data/` and `docs/changelog.md` to main, push.
- Market odds (benchmark only): on the first check of every even UTC hour, closing lines for results
  of the last two days that have none (OddsPapi, `docs/sources.md`). Needs the `ODDSPAPI_KEY` secret
  and `marketOdds` in the event config; otherwise skipped. A failure goes to the status message and
  never fails the check.
- A failed check is recorded in the status and the chain carries on; the run is marked failed at the
  end, so GitHub emails the repo owner.
- Liquipedia throttling: its rate limit is per IP, and GitHub runners share IPs, so a runner can be
  throttled although we send one or two requests per check (seen on 2026-11-23: two 429s in a row on
  one runner while the same request from the Mac got 200). A 429 or 503 is retried once after the
  server's `Retry-After` (10-90 s); two throttled checks in a row end the run early and start its
  successor, which runs on a fresh runner (`THROTTLE_LIMIT` in `.github/poll-loop.sh`).
- Pushes rebase onto newer commits (e.g. from a cloud Claude task) and retry up to 3 times; a rebase
  conflict is aborted and the run fails (GitHub emails the repo owner on failed runs).
- One run at a time (`concurrency: poll`); a late run waits.
- Secrets: `LIQUIPEDIA_CONTACT`, and `ODDSPAPI_KEY` for market odds (repository secrets, never in
  the repo).
- Status: each run force-pushes one file, `sync-status.json`, to the `poll-status` branch (checked at,
  outcome, revision, last change or error). Main gets no "still alive" commits.
- Cost: free (public repository). If the repository ever goes private again, the chain would use
  about 720 Actions minutes a day, far over GitHub Free's 2,000 a month: switch back to short runs.

### Local sync on the Mac (optional)

`node scripts/install-launchd.ts pull` installs a launchd job that every 10 minutes fast-forwards main
(only if the checkout is on main with no local changes) and mirrors `poll-status` into
`.cache/sync-status.json`. The stage page's status bar reads it:

| Word        | Meaning                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| **Waiting** | No stage running yet (checks start the day before) or the stage is finished     |
| **Live**    | A check reached this computer within 45 minutes; shows when, and the next check |
| **Problem** | The last check failed, or no update for 45+ minutes during a stage              |

The local poller (`install-launchd.ts poll <event> [--commit]`) is a fallback only. Never run it with
`--commit` next to the cloud poller.

## 2. Claude judgment tasks: Claude cloud scheduled tasks

Run on Anthropic's machines from a fresh clone of the repo; they use subscription usage like any
session. Each prompt runs one skill and pushes data straight to main (the cloud default would be a
`claude/` branch, which the poller would never see).

| Task             | Skill                                                                   | When (UTC)                    | Model          |
| ---------------- | ----------------------------------------------------------------------- | ----------------------------- | -------------- |
| research refresh | `research-team` (teams still in the event, news only, no HLTV)          | daily 21:00, Nov 22 - Dec 12  | Sonnet, medium |
| stage reviews    | `review-stage`                                                          | 18:00 on Nov 27, Dec 1, Dec 6 | Sonnet, high   |
| cleanup          | `cleanup` (data tidy, plus a docs checkup written to `data/checkup.md`) | Sundays 18:30                 | Sonnet, low    |

All run in the evening UTC, after the day's matches, so their pushes rarely meet a poller commit. When
they do, the poller rebases and retries (above), and its next check starts from the newer main.
Each prompt keeps its guardrails (date window, "already done", stage complete).

## 3. Pull request checks: GitHub Actions

`.github/workflows/check.yml` runs `npm run check`, `npm run validate` and `npm run build` on every pull
request to main (free: public repository). The poller's data commits go straight to main and are
validated by the poller itself.

## 4. Hooks (`.claude/settings.json`)

| Hook                    | Script                                                                                                                                     | Status |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| PreToolUse Edit\|Write  | `guard-edits.ts`: deny docs/core edits on main, deny edits to saved snapshots                                                              | active |
| PostToolUse Edit\|Write | `validate-data.ts`: validate edited data files against their schema                                                                        | active |
| Stop                    | `stop-check.ts`: `npm run check` only if code changed since the last pass; blocks on failure, reports after 3 attempts (built-in cap is 8) | active |
| SessionStart            | `session-start.ts`: print the newest `data/events/<id>/status.md` and open findings in `data/checkup.md`                                   | active |

## Headless fallback

`claude -p` only if needed. Never `--bare` (it skips the subscription login). Use
`--permission-mode auto --permission-prompts none --allowedTools ...`. Project hooks run there too.
