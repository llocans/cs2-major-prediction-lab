import { execFileSync } from 'node:child_process'
import { repoRoot } from './files.ts'

/** Paths automated jobs may commit. Code and docs other than the changelog never go in. */
export const DATA_PATHS = ['data', 'docs/changelog.md']

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

export type CommitOutcome =
  | { status: 'committed'; sha: string; pushed: boolean; pushError?: string }
  | { status: 'nothing' }
  | { status: 'skipped'; reason: string }

/**
 * Commits changes under DATA_PATHS on main and pushes, rebasing on newer commits from other writers.
 * Never touches other files, never commits on another branch. A push that still fails is reported.
 */
export function commitData(message: string): CommitOutcome {
  const branch = git(['branch', '--show-current'])
  if (branch !== 'main')
    return { status: 'skipped', reason: `checkout is on "${branch}", not main` }
  if (git(['status', '--porcelain', '--', ...DATA_PATHS]) === '') return { status: 'nothing' }

  git(['add', '--', ...DATA_PATHS])
  git(['commit', '--quiet', '-m', message, '--', ...DATA_PATHS])
  return pushWithRetry()
}

/**
 * Pushes main. If another writer (a cloud Claude task, another poller run) pushed first, rebases this
 * commit on top and tries again. A rebase conflict is aborted and reported, never resolved blindly.
 */
function pushWithRetry(attempts = 3): CommitOutcome {
  let lastError = ''
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      git(['push', '--quiet', 'origin', 'main'])
      return { status: 'committed', sha: git(['rev-parse', '--short', 'HEAD']), pushed: true }
    } catch (error) {
      lastError = String(error).slice(0, 300)
      try {
        git(['pull', '--rebase', '--quiet', 'origin', 'main'])
      } catch (rebaseError) {
        try {
          git(['rebase', '--abort'])
        } catch {
          // No rebase in progress: nothing to abort.
        }
        lastError = `rebase onto origin/main failed: ${String(rebaseError).slice(0, 250)}`
        break
      }
    }
  }
  return {
    status: 'committed',
    sha: git(['rev-parse', '--short', 'HEAD']),
    pushed: false,
    pushError: lastError,
  }
}
