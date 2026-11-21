/**
 * Installs or removes this project's launchd agents for the current user.
 * Usage:
 *   node scripts/install-launchd.ts pull                       local sync from the cloud poller (recommended)
 *   node scripts/install-launchd.ts poll <event-id> [--commit]  local Liquipedia poller (fallback only)
 *   node scripts/install-launchd.ts --uninstall <pull|poll>
 * The cloud poller (.github/workflows/poll.yml) replaces the local poll job; never run both with
 * --commit. Logs go to .cache/pull.log and .cache/poller.log.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { repoPath, repoRoot } from './lib/files.ts'

type Job = 'pull' | 'poll'
const isJob = (value: string | undefined): value is Job => value === 'pull' || value === 'poll'

const label = (job: Job) => `com.cs2-major-prediction-lab.${job}`
const target = (job: Job) => join(homedir(), 'Library/LaunchAgents', `${label(job)}.plist`)
const domain = `gui/${userInfo().uid}`

function bootout(job: Job): void {
  try {
    execFileSync('launchctl', ['bootout', `${domain}/${label(job)}`], { stdio: 'ignore' })
  } catch {
    // Not loaded: nothing to stop.
  }
}

/**
 * The node on PATH (e.g. /opt/homebrew/bin/node), not process.execPath: the latter resolves to a
 * versioned install path that breaks after a Node upgrade.
 */
function stableNodePath(): string {
  try {
    const found = execFileSync('/bin/sh', ['-lc', 'command -v node'], { encoding: 'utf8' }).trim()
    if (found) return found
  } catch {
    // Fall through to the running binary.
  }
  return process.execPath
}

const [first, second] = process.argv.slice(2)
if (first === '--uninstall') {
  if (!isJob(second)) {
    console.error('Usage: node scripts/install-launchd.ts --uninstall <pull|poll>')
    process.exit(1)
  }
  bootout(second)
  if (existsSync(target(second))) rmSync(target(second))
  console.log(`removed ${label(second)}`)
  process.exit(0)
}
if (!isJob(first) || (first === 'poll' && !second)) {
  console.error('Usage: node scripts/install-launchd.ts pull | poll <event-id> [--commit]')
  process.exit(1)
}

const plist = readFileSync(repoPath(`automation/launchd/${first}.plist.template`), 'utf8')
  .replaceAll('{{LABEL}}', label(first))
  .replaceAll('{{NODE}}', stableNodePath())
  .replaceAll('{{REPO}}', repoRoot)
  .replaceAll('{{EVENT_ID}}', second ?? '')
  .replaceAll(
    '{{EXTRA_ARGS}}',
    process.argv.includes('--commit') ? '<string>--commit</string>' : '',
  )

mkdirSync(repoPath('.cache'), { recursive: true })
mkdirSync(join(homedir(), 'Library/LaunchAgents'), { recursive: true })
writeFileSync(target(first), plist)
bootout(first)
execFileSync('launchctl', ['bootstrap', domain, target(first)])
console.log(`installed ${label(first)} → ${target(first)}`)
