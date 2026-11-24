/**
 * Stop hook. When this branch or session changes site code (site/, engine/, vite.config.ts) and
 * `npm run ui-audit` has not passed for exactly that code, it blocks once with a reminder to run the
 * audit and a fresh-eyes `ui-review`. It asks once per code state, so it can never loop; the
 * audit's own stamp (`.claude/state/ui-audit-pass.json`) clears it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT_STAMP, siteChanged, siteFingerprint } from '../../scripts/lib/site-fingerprint.ts'

interface HookInput {
  session_id?: string
  cwd?: string
}

const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd
if (!projectDir) process.exit(0)

try {
  if (!siteChanged(projectDir)) process.exit(0)
} catch {
  process.exit(0)
}

const fingerprint = siteFingerprint(projectDir)
const stampFile = join(projectDir, AUDIT_STAMP)
if (existsSync(stampFile)) {
  const stamp = JSON.parse(readFileSync(stampFile, 'utf8')) as { fingerprint?: string }
  if (stamp.fingerprint === fingerprint) process.exit(0)
}

const stateFile = join(
  projectDir,
  '.claude/state',
  `ui-reminder-${input.session_id ?? 'default'}.json`,
)
const reminded = existsSync(stateFile)
  ? (JSON.parse(readFileSync(stateFile, 'utf8')) as { fingerprint?: string }).fingerprint
  : undefined
if (reminded === fingerprint) process.exit(0)
mkdirSync(join(projectDir, '.claude/state'), { recursive: true })
writeFileSync(stateFile, JSON.stringify({ fingerprint }))

process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason:
      'Site code changed and the UI audit has not passed for it. Before finishing: run `npm run ui-audit` and fix every failure, then run the `ui-review` skill in a fresh subagent on the changed pages and fix or list every finding (asked once per code state).',
  }),
)
process.exit(0)
