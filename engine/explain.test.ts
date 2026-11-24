import { describe, expect, it } from 'vitest'
import { LITTLE_DATA_RD, matchConfidence, matchupConfidence } from './explain.ts'

/** Only rd matters for confidence. */
const modelWithRd = (rd: Record<string, number>) => ({ rd: (team: string) => rd[team] ?? 60 })

describe('matchConfidence', () => {
  it('is high with solid data and a clear favourite, low near 50%', () => {
    expect(matchConfidence(0.7, 90)).toBe('high')
    expect(matchConfidence(0.62, 118)).toBe('medium')
    expect(matchConfidence(0.53, 90)).toBe('low')
    expect(matchConfidence(0.8, 150)).toBe('low')
  })

  it('is low whenever a team has little tier-1 data', () => {
    expect(matchConfidence(0.7, 90, true)).toBe('low')
  })
})

describe('matchupConfidence', () => {
  it("does not let one team's solid data hide the other's lack of it", () => {
    // GOSH vs Chinggis Warriors before Stage 1 round 3: rd 58.5 and 103, 62% for GOSH.
    expect(matchupConfidence(modelWithRd({ a: 58.5, b: 103 }), 'a', 'b', 0.62)).toBe('low')
    expect(matchupConfidence(modelWithRd({ a: 58.5, b: LITTLE_DATA_RD - 1 }), 'a', 'b', 0.62)).toBe(
      'medium',
    )
  })
})
