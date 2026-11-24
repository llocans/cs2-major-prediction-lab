/**
 * SessionStart hook: prints the newest event status.md so every session starts with the current state,
 * plus the open findings of the last checkup (data/checkup.md, written by the cleanup skill), plus
 * the git state, with a warning when the folder already has uncommitted changes: several chats in one
 * folder overwrite each other's branch and files (CLAUDE.md, golden rule 13).
 * Output on stdout is added to Claude's context. Silent if there is nothing to show.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const files = globSync('data/events/*/status.md', { cwd: projectDir })
  .map((file) => ({ file, mtime: statSync(join(projectDir, file)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)

const newest = files[0]
if (newest) {
  const text = readFileSync(join(projectDir, newest.file), 'utf8')
  process.stdout.write(`Current event status (${newest.file}):\n\n${text.slice(0, 4000)}`)
}

const checkup = join(projectDir, 'data/checkup.md')
if (existsSync(checkup)) {
  const text = readFileSync(checkup, 'utf8')
  if (!text.includes('- No findings.')) {
    process.stdout.write(
      `\n\nOpen checkup findings (data/checkup.md). Raise them with the user; fixes go through a PR:\n\n${text.slice(0, 3000)}`,
    )
  }
}

/** Git output, or undefined when git is unavailable here (then the state is simply not shown). */
function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trimEnd()
  } catch {
    return undefined
  }
}

const branch = git(['branch', '--show-current'])
if (branch !== undefined) {
  const changed = (git(['status', '--porcelain']) ?? '').split('\n').filter(Boolean)
  const worktrees = (git(['worktree', 'list', '--porcelain']) ?? '')
    .split('\n')
    .filter((line) => line.startsWith('worktree ')).length
  process.stdout.write(
    `\n\nGit: branch ${branch || '(detached)'}, ${changed.length} uncommitted file(s), ${worktrees} worktree(s).`,
  )
  if (changed.length > 0) {
    process.stdout.write(
      `\nThis folder already has uncommitted changes this session did not make: another chat may be working here. Do not switch branches, stash, reset or commit them. Do your work in your own worktree (\`git worktree add <dir> -b <branch> origin/main\`) and commit only your own files by path. Tell the user.\nChanged: ${changed.slice(0, 15).join(', ')}`,
    )
  }
}
