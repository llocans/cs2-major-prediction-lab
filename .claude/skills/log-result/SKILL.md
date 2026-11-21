---
name: log-result
description: Record a real CS2 match result for the current event, update ratings, re-simulate and save the next-round snapshot. Manual fallback when the Liquipedia poller is not running.
model: sonnet
effort: medium
disable-model-invocation: true
allowed-tools: Bash(node scripts/log-result.ts:*), Bash(node scripts/poll-liquipedia.ts:*), Bash(npm run validate), Bash(git add:*), Bash(git commit:*), Read
---

# log-result

Records finished matches through the one pipeline in `scripts/lib/log-results.ts`
(validate → results.json → ratings → re-simulate → snapshot at round boundaries → status.md → changelog).

## Steps

1. Find the current event and stage in `data/events/*/status.md` (or ask).
2. Prefer the poller, it reads Liquipedia and logs everything new in one go:
   `node --env-file-if-exists=.env scripts/poll-liquipedia.ts <event-id> <stage-id>`
   If it fails because `LIQUIPEDIA_CONTACT` is missing, tell the user to add it to `.env`.
3. If Liquipedia is behind or unreachable, log by hand from a source the user named or HLTV
   (Browser pane), one match per call, scores from teamA's side, maps in play order:
   `node scripts/log-result.ts <event> <stage> <round> <teamA> <teamB> <map:a-b>... --source "<name>|<url>"`
   Team IDs come from `data/events/<id>/teams.json`; map IDs from `config.json` (e.g. `dust2`).
4. Run `npm run validate`.
5. Commit data straight to main: `git add data docs/changelog.md` and
   `git commit -m "data: <stage> round <n> results"`.
6. Reply in one or two lines: what was logged and whether a snapshot was saved.

## Rules

- Real results only. Never guess a score; if a source is unclear, stop and say so.
- Never edit `results.json` or snapshots by hand.
