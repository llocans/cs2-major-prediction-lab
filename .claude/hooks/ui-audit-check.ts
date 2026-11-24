/**
 * Stop hook. When this branch or session changed site code (site/, engine/, vite.config.ts) and the
 * UI audit has not passed for exactly that code, it runs `npm run ui-audit` itself (about 20 s, no
 * agent tokens). A pass stamps the code state and stays silent; a failure blocks with the failing
 * lines so they get fixed before the turn ends. After 3 failed runs in a row it reports instead of
 * blocking, so it can never loop. Skipped where Chromium is not installed (CI runs the audit anyway).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT_STAMP, siteChanged, siteFingerprint } from '../../scripts/lib/site-fingerprint.ts'

const MAX_ATTEMPTS = 3

interface HookInput {
  session_id?: string
  stop_hook_active?: boolean
  cwd?: string
}

interface State {
  failed?: string
  attempts: number
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

// No Chromium here (e.g. a cloud session): leave it to CI.
try {
  const { chromium } = await import('playwright')
  if (!existsSync(chromium.executablePath())) process.exit(0)
} catch {
  process.exit(0)
}

const stateDir = join(projectDir, '.claude/state')
const stateFile = join(stateDir, `ui-audit-check-${input.session_id ?? 'default'}.json`)
const state: State = existsSync(stateFile)
  ? (JSON.parse(readFileSync(stateFile, 'utf8')) as State)
  : { attempts: 0 }

// Already reported this exact failing state the maximum number of times.
if (state.failed === fingerprint && state.attempts >= MAX_ATTEMPTS) process.exit(0)

const run = spawnSync('node', ['scripts/ui-audit.ts'], {
  cwd: projectDir,
  encoding: 'utf8',
  timeout: 150_000,
})
if (run.status === 0) {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(stateFile, JSON.stringify({ attempts: 0 }))
  process.exit(0)
}

const attempts = (input.stop_hook_active ? state.attempts : 0) + 1
mkdirSync(stateDir, { recursive: true })
writeFileSync(stateFile, JSON.stringify({ failed: fingerprint, attempts }))

const reportFile = join(projectDir, '.ui-audit/report.md')
const failures = existsSync(reportFile)
  ? readFileSync(reportFile, 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('## ') || line.startsWith('- FAIL'))
      .filter((line, i, lines) => line.startsWith('- FAIL') || lines[i + 1]?.startsWith('- FAIL'))
      .slice(0, 30)
      .join('\n')
  : `${run.stdout ?? ''}\n${run.stderr ?? ''}`.trim().split('\n').slice(-20).join('\n')

if (attempts >= MAX_ATTEMPTS) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: `The UI audit still fails after ${attempts} attempts; not blocking again. See .ui-audit/report.md.\n${failures}`,
    }),
  )
  process.exit(0)
}

process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason: `The UI audit failed (attempt ${attempts} of ${MAX_ATTEMPTS}). Fix these before finishing (full report and screenshots in .ui-audit/):\n${failures}`,
  }),
)
process.exit(0)
