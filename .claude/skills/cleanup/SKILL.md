---
name: cleanup
description: Tidy the CS2 lab data - remove expired modifiers, mark stale facts, check sources and references. Commits data fixes to main and reports anything that needs code changes.
model: sonnet
effort: low
disable-model-invocation: true
allowed-tools: Read, Edit, Grep, Glob, Agent, Bash(npm run validate), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git status:*)
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
5. Leave snapshots, `results.json` and code alone. Code problems go into your reply, not a commit.
6. `npm run validate`, then commit to main: `data: cleanup <date>`.
7. Reply in 3 lines or fewer.
