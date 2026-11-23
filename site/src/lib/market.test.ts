import { describe, expect, it } from 'vitest'
import { type MarketData, marketChance, teamStageMatches } from './market.ts'

const data: MarketData = {
  benchmarks: [{ stageId: 's1', round: 1, teamA: 'a', teamB: 'b', pA: 0.6 }],
  snapshots: [
    { stageId: 's1', beforeRound: 1, matches: [{ teamA: 'a', teamB: 'b', pA: 0.55 }] },
    // Round 2 snapshot predicted a vs c, but the real draw was a vs d.
    { stageId: 's1', beforeRound: 2, matches: [{ teamA: 'a', teamB: 'c', pA: 0.7 }] },
    { stageId: 's2', beforeRound: 1, matches: [{ teamA: 'a', teamB: 'x', pA: 0.5 }] },
  ],
  results: {
    matches: [
      { stageId: 's1', round: 1, teamA: 'b', teamB: 'a', winner: 'b' },
      { stageId: 's1', round: 2, teamA: 'a', teamB: 'd', winner: 'a' },
    ],
  },
}

describe('market odds', () => {
  it('reads the market chance from either side', () => {
    expect(marketChance(data, 's1', 1, 'a', 'b')).toBe(0.6)
    expect(marketChance(data, 's1', 1, 'b', 'a')).toBeCloseTo(0.4)
    expect(marketChance(data, 's1', 2, 'a', 'b')).toBeUndefined()
  })

  it("lists a team's stage matches with model, market and result", () => {
    expect(teamStageMatches(data, 's1', 'a')).toEqual([
      { round: 1, opponent: 'b', model: 0.55, market: 0.6, result: 'L' },
      { round: 2, opponent: 'd', model: undefined, market: undefined, result: 'W' },
    ])
  })
})
