# Automation

Three layers. Built in stages: the Stage 1 critical path first (poller), the rest during Stage 2.

## 1. Plain scripts (no Claude usage), launchd

| Job               | What                                                                                                                                                 | When                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `poll-liquipedia` | Fetch the current stage page via the MediaWiki API, log new results, re-simulate, save the next-round snapshot when its pairings are known, validate | Every 10 min during match days |

- launchd does not run while the Mac sleeps; a missed interval runs once on wake. Keep the Mac awake on
  match days (Stage 1 starts 05:00 CET, Nov 24-27).
- The plist template lives in `automation/launchd/`. Install with
  `node scripts/install-launchd.ts pgl-major-singapore-2026`, remove with `--uninstall`. Logs: `.cache/poller.log`.
- The poller picks the Swiss stage whose dates (±1 day) contain today and exits quietly otherwise.
- It needs `LIQUIPEDIA_CONTACT` in `.env`.
- Commits: manual during Stage 1; the poller commits `data:` changes to main from Stage 2 on.

## 2. Desktop scheduled tasks (Claude judgment)

Planned for Stage 2: research updates, stage reviews, cleanup. Local, "Only on this computer", each with
its own model and permission mode, and one "Run now" with the user to always-allow its tools.
Every prompt includes late-run guardrails: one catch-up run happens after sleep, so skip work whose
window has passed.

Note: a project-level `defaultMode: "auto"` is ignored by Claude Code; set the permission mode per task.

## 3. Hooks (`.claude/settings.json`)

| Hook                    | Script                                                                                                 | Status  |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ------- |
| PreToolUse Edit\|Write  | `guard-edits.ts`: deny docs/core edits on main, deny edits to saved snapshots                          | active  |
| PostToolUse Edit\|Write | `validate-data.ts`: validate edited data files against their schema                                    | active  |
| Stop                    | run check only if code changed; honour `stop_hook_active`; report after 3 attempts (built-in cap is 8) | planned |
| SessionStart            | print `data/events/<id>/status.md`                                                                     | planned |

## Headless fallback

`claude -p` only if needed. Never `--bare` (it skips the subscription login). Use
`--permission-mode auto --permission-prompts none --allowedTools ...`. Project hooks run there too.
