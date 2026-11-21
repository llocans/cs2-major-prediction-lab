/**
 * Stop hook. If code changed since the last successful check, run `npm run check` (typecheck, lint,
 * tests) before Claude finishes. On failure it blocks once per attempt with the error tail; after
 * MAX_ATTEMPTS failed attempts in a row it stops blocking and reports instead, so it can never loop.
 * Data-only changes are left to the PostToolUse schema hook.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_ATTEMPTS = 3
const CODE_PATHS = [
  'engine',
  'scripts',
  'site',
  'data/schemas',
  '.claude/hooks',
  'package.json',
  'tsconfig.json',
  'biome.json',
  'vite.config.ts',
  'vitest.config.ts',
]

interface HookInput {
  session_id?: string
  stop_hook_active?: boolean
  cwd?: string
}

const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd
if (!projectDir) process.exit(0)

const git = (args: string[]) =>
  execFileSync('git', args, { cwd: projectDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

/** Fingerprint of uncommitted and committed-but-unchecked code: HEAD + diff + untracked file contents. */
function codeFingerprint(): string {
  const hash = createHash('sha256')
  hash.update(git(['rev-parse', 'HEAD']))
  hash.update(git(['diff', 'HEAD', '--', ...CODE_PATHS]))
  for (const file of git(['ls-files', '--others', '--exclude-standard', '--', ...CODE_PATHS])
    .split('\n')
    .filter(Boolean)) {
    hash.update(file)
    hash.update(readFileSync(join(projectDir as string, file)))
  }
  return hash.digest('hex')
}

interface State {
  checked?: string
  failed?: string
  attempts: number
}

const stateDir = join(projectDir, '.claude/state')
const stateFile = join(stateDir, `stop-check-${input.session_id ?? 'default'}.json`)
const state: State = existsSync(stateFile)
  ? (JSON.parse(readFileSync(stateFile, 'utf8')) as State)
  : { attempts: 0 }
const save = (next: State) => {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(stateFile, JSON.stringify(next))
}

const fingerprint = codeFingerprint()
if (fingerprint === state.checked) process.exit(0)

// Already reported this exact failing state: don't run or block again.
if (fingerprint === state.failed && state.attempts >= MAX_ATTEMPTS) process.exit(0)

const run = spawnSync('npm', ['run', '--silent', 'check'], {
  cwd: projectDir,
  encoding: 'utf8',
  timeout: 170_000,
})
if (run.status === 0) {
  save({ checked: fingerprint, attempts: 0 })
  process.exit(0)
}

const attempts = (input.stop_hook_active ? state.attempts : 0) + 1
save({ ...state, failed: fingerprint, attempts })
const tail = `${run.stdout ?? ''}\n${run.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n')

if (attempts >= MAX_ATTEMPTS) {
  // Give up blocking; tell the user instead.
  process.stdout.write(
    JSON.stringify({
      systemMessage: `npm run check still fails after ${attempts} attempts; not blocking again. Last output:\n${tail}`,
    }),
  )
  process.exit(0)
}

process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason: `npm run check failed (attempt ${attempts} of ${MAX_ATTEMPTS}). Fix it before finishing:\n${tail}`,
  }),
)
process.exit(0)
