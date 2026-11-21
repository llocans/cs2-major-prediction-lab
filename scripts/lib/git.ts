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
 * Commits changes under DATA_PATHS on main and pushes. Never touches other files, never commits on
 * another branch. A failed push is reported (the commit stays local and goes out with the next push).
 */
export function commitData(message: string): CommitOutcome {
  const branch = git(['branch', '--show-current'])
  if (branch !== 'main')
    return { status: 'skipped', reason: `checkout is on "${branch}", not main` }
  if (git(['status', '--porcelain', '--', ...DATA_PATHS]) === '') return { status: 'nothing' }

  git(['add', '--', ...DATA_PATHS])
  git(['commit', '--quiet', '-m', message, '--', ...DATA_PATHS])
  const sha = git(['rev-parse', '--short', 'HEAD'])
  try {
    git(['push', '--quiet', 'origin', 'main'])
    return { status: 'committed', sha, pushed: true }
  } catch (error) {
    return { status: 'committed', sha, pushed: false, pushError: String(error).slice(0, 300) }
  }
}
