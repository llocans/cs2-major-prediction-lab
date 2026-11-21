/**
 * Installs (or removes) the Liquipedia poller as a launchd agent for the current user.
 * Usage:
 *   node scripts/install-launchd.ts <event-id>       install and start
 *   node scripts/install-launchd.ts --uninstall      stop and remove
 * Logs go to .cache/poller.log.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { repoPath, repoRoot } from './lib/files.ts'

const LABEL = 'com.cs2-major-prediction-lab.poll'
const target = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`)
const domain = `gui/${userInfo().uid}`

function bootout(): void {
  try {
    execFileSync('launchctl', ['bootout', `${domain}/${LABEL}`], { stdio: 'ignore' })
  } catch {
    // Not loaded: nothing to stop.
  }
}

const arg = process.argv[2]
if (arg === '--uninstall') {
  bootout()
  if (existsSync(target)) rmSync(target)
  console.log(`removed ${LABEL}`)
  process.exit(0)
}
if (!arg) {
  console.error('Usage: node scripts/install-launchd.ts <event-id> | --uninstall')
  process.exit(1)
}

const plist = readFileSync(repoPath('automation/launchd/poll.plist.template'), 'utf8')
  .replaceAll('{{LABEL}}', LABEL)
  .replaceAll('{{NODE}}', process.execPath)
  .replaceAll('{{REPO}}', repoRoot)
  .replaceAll('{{EVENT_ID}}', arg)

mkdirSync(repoPath('.cache'), { recursive: true })
mkdirSync(join(homedir(), 'Library/LaunchAgents'), { recursive: true })
writeFileSync(target, plist)
bootout()
execFileSync('launchctl', ['bootstrap', domain, target])
console.log(`installed ${LABEL} → ${target}`)
