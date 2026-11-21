/**
 * Local sync (launchd on the Mac, optional): fast-forwards main to what the cloud poller pushed and
 * mirrors the cloud run status into .cache/sync-status.json for the site's status bar.
 * Never merges, never touches a checkout that is on another branch or has local changes.
 * Usage: node scripts/pull-latest.ts
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { repoPath, repoRoot } from './lib/files.ts'

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`)
const git = (args: string[]) =>
  execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

const branch = git(['branch', '--show-current'])
if (branch !== 'main') {
  log(`skipped: checkout is on "${branch}"`)
} else if (git(['status', '--porcelain', '--untracked-files=no']) !== '') {
  log('skipped: local changes in tracked files')
} else {
  try {
    git(['pull', '--ff-only', '--quiet', 'origin', 'main'])
    log(`main at ${git(['rev-parse', '--short', 'HEAD'])}`)
  } catch (error) {
    log(`pull failed: ${String(error).slice(0, 200)}`)
    process.exitCode = 1
  }
}

// The status mirror is independent of the branch: it only writes a gitignored file.
try {
  git(['fetch', '--quiet', 'origin', 'poll-status'])
  mkdirSync(repoPath('.cache'), { recursive: true })
  writeFileSync(repoPath('.cache/sync-status.json'), git(['show', 'FETCH_HEAD:sync-status.json']))
} catch {
  log('no poll-status branch yet (the cloud poller has not run)')
}
