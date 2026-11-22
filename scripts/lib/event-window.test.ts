import { describe, expect, it } from 'vitest'
import { isEventWindowOpen } from './event-window.ts'

// PGL Major Singapore 2026 stage dates.
const stages = [
  { start: '2026-11-24', end: '2026-11-27' },
  { start: '2026-11-28', end: '2026-12-01' },
  { start: '2026-12-02', end: '2026-12-06' },
  { start: '2026-12-10', end: '2026-12-13' },
]

describe('isEventWindowOpen', () => {
  it('opens 3 days before the first stage', () => {
    expect(isEventWindowOpen(stages, '2026-11-20')).toBe(false)
    expect(isEventWindowOpen(stages, '2026-11-21')).toBe(true)
  })

  it('stays open in the gap between Stage 3 and the playoffs', () => {
    for (const day of ['2026-12-07', '2026-12-08', '2026-12-09']) {
      expect(isEventWindowOpen(stages, day)).toBe(true)
    }
  })

  it('closes the day after the trailing day of the last stage', () => {
    expect(isEventWindowOpen(stages, '2026-12-14')).toBe(true)
    expect(isEventWindowOpen(stages, '2026-12-15')).toBe(false)
  })

  it('is closed for an event without stages', () => {
    expect(isEventWindowOpen([], '2026-11-25')).toBe(false)
  })
})
