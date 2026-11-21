/**
 * PreToolUse (Edit|Write). Denies:
 *  - edits to docs/core/ while on the main branch (core changes go through a core/* branch + PR)
 *  - edits to snapshot files that already exist (snapshots are never edited)
 * Fast and dependency-free: no Zod, no network.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'

interface HookInput {
  cwd?: string
  tool_input?: { file_path?: string }
}

function deny(reason: string): never {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }
  process.stdout.write(JSON.stringify(output))
  process.exit(0)
}

const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput
const filePath = input.tool_input?.file_path
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd
if (!filePath || !projectDir) process.exit(0)

const relativePath = relative(projectDir, filePath).split('\\').join('/')

if (/^data\/events\/[^/]+\/snapshots\//.test(relativePath) && existsSync(filePath)) {
  deny(`${relativePath} is a saved snapshot. Snapshots are never edited; save a new one instead.`)
}

if (relativePath.startsWith('docs/core/')) {
  let branch = ''
  try {
    branch = execFileSync('git', ['branch', '--show-current'], {
      cwd: projectDir,
      encoding: 'utf8',
    })
      .toString()
      .trim()
  } catch {
    // No git or detached HEAD: treat as main to stay safe.
    branch = 'main'
  }
  if (branch === 'main' || branch === '') {
    deny('docs/core/ is protected on main. Create a core/<topic> branch and open a PR.')
  }
}

process.exit(0)
