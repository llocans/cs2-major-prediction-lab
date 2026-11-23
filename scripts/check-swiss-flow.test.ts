import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// Runs the end-to-end Swiss pipeline check (in its own temp copy of the repo) as part of `npm run check`.
it('Swiss pipeline end to end on made-up data', () => {
  const run = spawnSync(process.execPath, [join(import.meta.dirname, 'check-swiss-flow.ts')], {
    encoding: 'utf8',
    timeout: 170_000,
  })
  expect(run.stdout).toContain('All Swiss flow checks passed.')
  expect(run.status).toBe(0)
}, 180_000)
