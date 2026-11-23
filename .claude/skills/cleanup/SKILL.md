---
name: cleanup
description: Tidy the CS2 lab data (expired modifiers, stale facts, sources) and check that the docs, roadmap and routines still match the repo. Commits data fixes to main; writes doc and code problems to data/checkup.md.
model: sonnet
effort: low
disable-model-invocation: true
allowed-tools: Read, Edit, Grep, Glob, Agent, Bash(npm run validate), Bash(npm run check), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git status:*)
---

# cleanup

1. `npm run validate`. Fix data problems you can fix from the data itself; report the rest.
2. Ask the `checker` subagent to list: team-file facts without a source or date, current-state claims
   older than 60 days not marked `(stale)`, and sections still saying "pending".
3. Fix what it finds in `data/teams/*.md`. Mark `(stale)` only claims about the current state (lineup,
   coach, stand-ins, injuries, form or map-pool summaries) that are older than 60 days or overtaken by
   news. Dated past events (match results, "joined on", "benched on") are history: never mark them stale,
   never delete sourced history.
4. In `data/model/modifiers.json`, remove modifiers whose `expires` is in the past, and note each
   removal in the team file's Modifiers section.
5. **Docs checkup (report only).** Docs and code change only through a PR, so never edit them here.
   - `npm run check`: it includes a test that every path the docs mention still exists.
   - `docs/roadmap.md`: items that look done (compare with `git log` since the last checkup), items
     whose date has passed, and problems you met that are not on it.
   - README "Current limitations", `docs/automation.md` (routines and their dates) and the skills:
     anything that no longer matches the repo or what the scripts print.
6. Overwrite `data/checkup.md` (generated; never edit it by hand):
   ```
   # Checkup
   Generated <YYYY-MM-DD> by the cleanup skill. Do not edit by hand.

   - <file>: <what is out of date or broken, and the fix> (one line each)
   ```
   With nothing to report, the list is the single line `- No findings.`
7. Leave snapshots, `results.json` and code alone.
8. `npm run validate`, then commit to main: `data: cleanup <date>` (data fixes and `data/checkup.md`).
9. Reply in 3 lines or fewer.
