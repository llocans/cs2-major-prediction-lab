---
name: research-team
description: Research one CS2 team (or all teams of a stage) and update its sourced data and notes, including roster news and judgment modifiers. Writes data and commits to main.
model: sonnet
effort: medium
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Grep, Glob, WebSearch, WebFetch, Bash(node --env-file-if-exists=.env scripts/research/*), Bash(node scripts/research/*), Bash(npm run validate), Bash(git add:*), Bash(git commit:*), Bash(git push:*)
---

# research-team

Input: a team ID from `data/teams/registry.json`, or a stage ID for all of its teams.
Every fact gets a date and a source. Never invent stats; if a source is unreachable, say so.

## Steps
1. **Numbers by script** (no tokens spent on copying):
   - VRS form: `node scripts/research/vrs-form.ts <event> <YYYY_MM_DD>` (latest standings date in the
     Valve repo `live/<year>/`).
   - Rosters: `node --env-file-if-exists=.env scripts/research/liquipedia-rosters.ts <event>`.
   - New event only, never in scheduled runs (one template expansion each): short names
     `node --env-file-if-exists=.env scripts/research/short-names.ts <event>` and team logos
     `node --env-file-if-exists=.env scripts/research/team-logos.ts <event>`. Then `npm run validate`.
2. **HLTV map stats** (interactive only, never in scheduled runs): in Claude in Chrome, read
   `hltv.org/stats/teams/maps/<id>/<slug>?startDate=<3 months ago>&endDate=<today>&rankingFilter=Top50`
   (the built-in Browser pane loops on Cloudflare). Write `<team-id> <id/slug> map:W/L ...` lines to a
   scratch file and import with `node scripts/research/import-map-stats.ts <file> <from> <to> Top50`.
3. **News**: search for roster changes, stand-ins, visa or travel problems, illness. Prefer HLTV news,
   Dust2.us, Liquipedia, the team's own posts. Two independent sources for anything that moves the model.
4. **Team file** `data/teams/<id>.md`: update the sections in place, keep the template
   (docs/core/data.md). Mark facts older than 60 days `(stale)`. Opinions are prefixed "Opinion:".
5. **Modifiers** (`data/model/modifiers.json`) only for things the numbers can't see yet (stand-in,
   illness, a new player with no maps). Each needs `delta` within ±40, a reason of 10+ characters, a
   source, `createdAt`, and an `expires` date no later than the event end. Remove ones that no longer apply.
6. Once the event has results, `scripts/build-ratings.ts` only adds teams that have no rating yet
   (later-stage invites). Never pass `--force` mid-event: it would wipe the updates from real matches.
7. `npm run validate`, then commit data straight to main:
   `git add data && git commit -m "data: research <team or stage>" && git push`.
8. Reply in 3 lines or fewer: what changed and any modifier added or removed.
