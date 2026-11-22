import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// Runs the end-to-end playoff pipeline check (in its own temp copy of the repo) as part of `npm run check`.
it('playoff pipeline end to end on made-up data', () => {
  const run = spawnSync(process.execPath, [join(import.meta.dirname, 'check-playoff-flow.ts')], {
    encoding: 'utf8',
    timeout: 120_000,
  })
  expect(run.stdout).toContain('All playoff flow checks passed.')
  expect(run.status).toBe(0)
}, 130_000)
