/**
 * Runs an end-to-end check script in a throwaway copy of the repo, so it can write data freely.
 * The parent copies the repo (no .git, secrets or local settings), re-runs the script there with
 * --in-copy and exits with its status; the child checks that it really is in such a copy.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { EventResults, EventTeams } from '../../data/schemas/index.ts'
import { readJson, repoPath, repoRoot, writeJson } from './files.ts'

const IN_COPY = '--in-copy'
/** Set by the parent to the copy's path; the child refuses to run anywhere else. */
const COPY_ENV = 'CS2_FLOW_CHECK_COPY'

/**
 * In the parent: copies the repo, runs `script` there and exits with its status (never returns).
 * In the child: returns after checking that the repo root is the copy the parent made.
 */
export function enterTempCopy(script: string, args: readonly string[], prefix: string): void {
  if (!process.argv.includes(IN_COPY)) {
    const copy = mkdtempSync(join(tmpdir(), prefix))
    cpSync(repoRoot, copy, {
      recursive: true,
      filter: (path) =>
        // No secrets (.env) or local settings in the copy: it may outlive a killed run.
        !/[\\/](node_modules|\.git|dist|\.cache|\.claude|\.env[^\\/]*)([\\/]|$)/.test(
          path.slice(repoRoot.length),
        ),
    })
    symlinkSync(join(repoRoot, 'node_modules'), join(copy, 'node_modules'))
    const run = spawnSync(
      process.execPath,
      [join(copy, relative(repoRoot, script)), ...args, IN_COPY],
      { stdio: 'inherit', env: { ...process.env, [COPY_ENV]: realpathSync(copy) } },
    )
    rmSync(copy, { recursive: true, force: true })
    process.exit(run.status ?? 1)
  }
  // Safety: only ever write inside the copy the parent made (path passed in the environment, under
  // the temp dir, with our prefix). Running with --in-copy by hand in a real checkout fails here.
  const root = realpathSync(repoRoot)
  if (
    process.env[COPY_ENV] !== root ||
    !root.startsWith(realpathSync(tmpdir())) ||
    !basename(root).startsWith(prefix)
  ) {
    throw new Error(`Refusing to run outside the temp copy made by this script (repo root ${root})`)
  }
}

/**
 * Puts the copy's event back to before its first match: no results, no advanced seeds, no
 * snapshots. The checks then behave the same before, during and after the real event.
 */
export function resetEventProgress(eventId: string): void {
  const dir = repoPath('data/events', eventId)
  const results = readJson(`${dir}/results.json`, EventResults)
  writeJson(`${dir}/results.json`, EventResults, { ...results, matches: [] })
  const teams = readJson(`${dir}/teams.json`, EventTeams)
  const participants = teams.participants.map(({ advancedSeeds: _, ...p }) => p)
  writeJson(`${dir}/teams.json`, EventTeams, { ...teams, participants })
  const snapshots = `${dir}/snapshots`
  if (existsSync(snapshots)) {
    // Recursive: alongside versions keep their snapshots in snapshots/alongside/<version>/.
    for (const file of readdirSync(snapshots)) rmSync(join(snapshots, file), { recursive: true })
  }
}
