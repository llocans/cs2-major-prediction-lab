import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Paths whose changes can change what the site shows. */
export const SITE_PATHS = ['site', 'engine', 'vite.config.ts']

const git = (dir: string, args: string[]) =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

/**
 * Fingerprint of the site code as it is on disk: HEAD's tree for the site paths, the uncommitted
 * diff and untracked files. `ui-audit.ts` stamps it on a pass; the Stop hook compares it.
 */
export function siteFingerprint(dir: string): string {
  const hash = createHash('sha256')
  for (const path of SITE_PATHS) {
    try {
      hash.update(git(dir, ['rev-parse', `HEAD:${path}`]))
    } catch {
      hash.update(`missing:${path}`)
    }
  }
  hash.update(git(dir, ['diff', 'HEAD', '--', ...SITE_PATHS]))
  for (const file of git(dir, ['ls-files', '--others', '--exclude-standard', '--', ...SITE_PATHS])
    .split('\n')
    .filter(Boolean)) {
    hash.update(file)
    hash.update(readFileSync(join(dir, file)))
  }
  return hash.digest('hex')
}

/** True when this branch or the working tree changes site code compared with origin/main. */
export function siteChanged(dir: string): boolean {
  if (git(dir, ['diff', 'HEAD', '--name-only', '--', ...SITE_PATHS]).trim() !== '') return true
  if (git(dir, ['ls-files', '--others', '--exclude-standard', '--', ...SITE_PATHS]).trim() !== '')
    return true
  try {
    return (
      git(dir, ['diff', '--name-only', 'origin/main...HEAD', '--', ...SITE_PATHS]).trim() !== ''
    )
  } catch {
    return false
  }
}

/** Where `ui-audit.ts` records the fingerprint of the last passing run. */
export const AUDIT_STAMP = '.claude/state/ui-audit-pass.json'
