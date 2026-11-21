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
  it('is Live with the next check during the stage', () => {
    const f = freshness(at('2026-11-24T06:04:00Z'), sync('2026-11-24T06:00:00Z'), stage)
    expect(f.label).toBe('Live')
    expect(f.detail).toBe('Results checked 4 min ago, next check in about 11 min.')
  })

  it('is a Problem when no update arrived for too long during the stage', () => {
    const f = freshness(at('2026-11-24T09:00:00Z'), sync('2026-11-24T06:00:00Z'), stage)
    expect(f.label).toBe('Problem')
    expect(f.detail).toContain('No update for 3 h 0 min')
  })

  it('is Waiting before the stage and after it', () => {
    expect(freshness(at('2026-11-21T20:00:00Z'), undefined, stage)).toMatchObject({
      label: 'Waiting',
      detail: 'Automatic result checks start 23 Nov.',
    })
    expect(freshness(at('2026-12-01T12:00:00Z'), sync('2026-11-28T10:00:00Z'), stage).detail).toBe(
      'Stage finished. Results are final.',
    )
  })

  it('is a Problem when the last check failed or none arrived during the stage', () => {
    const failed = { ...sync('2026-11-24T05:59:00Z', 'error'), message: 'HTTP 503' }
    expect(freshness(at('2026-11-24T06:00:00Z'), failed, stage).detail).toContain('HTTP 503')
    expect(freshness(at('2026-11-24T06:00:00Z'), undefined, stage).label).toBe('Problem')
  })

  it('formats durations', () => {
    expect(formatAgo(0)).toBe('just now')
    expect(formatAgo(125)).toBe('2 h 5 min ago')
  })
})
