---
name: log-odds
description: Read one bookmaker's match-winner odds for the next round of the current CS2 event (CSGOEmpire, in Claude in Chrome, read-only) and log them for the Market odds page. Use when the user asks to save, fetch or log the market or betting odds for a round.
model: sonnet
effort: medium
disable-model-invocation: true
allowed-tools: Bash(node scripts/log-odds.ts:*), Bash(npm run validate), Bash(git add:*), Bash(git commit:*), Read
---

# log-odds

Logs margin-free match-winner probabilities to `data/events/<id>/bookmaker-odds.json`, shown on the
site's Market odds page (`#/market/<stage>`), and the decimal odds to the git-ignored
`data/events/<id>/local/market-odds.json` (real payouts for bet slips, never committed). A benchmark
only: the model never reads them.

## Steps

1. Find the current event, stage and next round in `data/events/*/status.md`.
2. Open `https://csgoempire.com/match-betting` in Claude in Chrome (a new tab; no sign-in needed)
   and read the "Winner" odds of every match of that round from the Counter-Strike section. The odds
   sit in an embedded widget, so read them from a screenshot. Read only: never click a price, the
   betslip or anything that places a bet. Close the tab when done.
3. Check every pair against the round's snapshot (`snapshots/<stage>-r<n>.json`); a pair that is not
   in it is a different round, so leave it out.
4. Log the round in one call, team IDs from `teams.json` (GOSH is `bc-game`):
   `node scripts/log-odds.ts <event> <stage> <round> <teamA> <oddsA> <teamB> <oddsB> ... --source "CSGOEmpire match-winner odds, margin removed|https://csgoempire.com/match-betting"`
   For odds the user sent earlier (screenshot or typed), add `--date <YYYY-MM-DD>` of that day.
5. Run `npm run validate`, then commit data straight to main:
   `git add data/events/<id>/bookmaker-odds.json` and `git commit -m "data: <stage> round <n> bookmaker odds"`.
6. Reply in one or two lines and point to `#/market/<stage>`.

## Rules

- Never automate this: CSGOEmpire's terms forbid bots and scripts, so no scheduled task, cloud
  routine or script reads the site (`docs/sources.md`).
- Commit only `bookmaker-odds.json` (margin-free percentages). The decimal odds stay in the
  git-ignored `local/` file; never copy them into a committed file, a commit message or the site.
- The site never names the bookmaker (labels say "pre-match"); keep it that way.
- Pre-match odds only, never live or in-play prices.
