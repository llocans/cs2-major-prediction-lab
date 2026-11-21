import { describe, expect, it } from 'vitest'
import { brierScore, calibration, hitRate } from './scoring.ts'

describe('scoring', () => {
  it('Brier: 50% always scores 0.25; perfect scores 0', () => {
    expect(
      brierScore([
        { p: 0.5, outcome: 1 },
        { p: 0.5, outcome: 0 },
      ]),
    ).toBe(0.25)
    expect(
      brierScore([
        { p: 1, outcome: 1 },
        { p: 0, outcome: 0 },
      ]),
    ).toBe(0)
    expect(() => brierScore([])).toThrow()
  })

  it('calibration bins average predicted and observed rates', () => {
    const bins = calibration([
      { p: 0.62, outcome: 1 },
      { p: 0.68, outcome: 0 },
      { p: 0.95, outcome: 1 },
    ])
    expect(bins).toHaveLength(2)
    expect(bins[0]).toMatchObject({ count: 2, observed: 0.5 })
    expect(bins[0]?.predicted).toBeCloseTo(0.65)
    expect(bins[1]).toMatchObject({ count: 1, observed: 1 })
  })

  it('hit rate counts favourites that won', () => {
    expect(
      hitRate([
        { p: 0.7, outcome: 1 },
        { p: 0.3, outcome: 1 },
        { p: 0.5, outcome: 1 },
      ]),
    ).toBe(0.5)
  })
})
