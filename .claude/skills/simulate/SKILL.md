---
name: simulate
description: Re-run the Monte Carlo for the current CS2 event stage and report the odds briefly. Use when asked for current predictions, odds, or "what are the chances". Read-only; writes nothing.
model: sonnet
effort: low
allowed-tools: Bash(node scripts/simulate.ts:*), Read
---

# simulate

1. Find the event and the current stage in `data/events/*/status.md` (newest file).
2. Run `node scripts/simulate.ts <event-id> <stage-id>`. It prints the odds table and next matches.
3. Reply in at most 5 lines: the top 3 advance odds, any match under 55/45 worth watching, and the
   run count and max standard error. Point to the UI (`npm run dev`, `#/stage/<stage-id>`) for the rest.

Rules
- This skill never writes files. Snapshots come only from `scripts/snapshot.ts` or the poller.
- Don't round away uncertainty: quote probabilities as the script prints them.
