import { describe, expect, it } from 'vitest'
import type { SyncStatus } from '../../../data/schemas/sync.ts'
import { formatAgo, freshness } from './freshness.ts'

const stage = { start: '2026-11-24', end: '2026-11-27' }
const at = (iso: string) => Date.parse(iso)
const sync = (checkedAt: string, outcome: SyncStatus['outcome'] = 'checked'): SyncStatus => ({
  schemaVersion: 1,
  eventId: 'e',
  checkedAt,
  outcome,
})

describe('freshness', () => {
  it('is live with a next-check estimate during the stage', () => {
    const f = freshness(at('2026-11-24T06:04:00Z'), sync('2026-11-24T06:00:00Z'), stage)
    expect(f.state).toBe('live')
    expect(f.message).toContain('4 min ago')
    expect(f.message).toContain('in ~6 min')
  })

  it('warns when the poller stopped during the stage', () => {
    const f = freshness(at('2026-11-24T09:00:00Z'), sync('2026-11-24T06:00:00Z'), stage)
    expect(f.state).toBe('stale')
    expect(f.message).toContain('Is the Mac awake')
  })

  it('is idle before the stage window opens', () => {
    const f = freshness(at('2026-11-21T20:00:00Z'), sync('2026-11-21T19:50:00Z', 'idle'), stage)
    expect(f.state).toBe('idle')
    expect(f.message).toContain('until 23 Nov')
  })

  it('reports errors and missing status', () => {
    expect(
      freshness(
        at('2026-11-24T06:00:00Z'),
        { ...sync('2026-11-24T05:59:00Z', 'error'), message: 'HTTP 503' },
        stage,
      ).message,
    ).toContain('HTTP 503')
    expect(freshness(at('2026-11-24T06:00:00Z'), undefined, stage).state).toBe('unknown')
  })

  it('formats durations', () => {
    expect(formatAgo(0)).toBe('just now')
    expect(formatAgo(125)).toBe('2 h 5 min ago')
  })
})
