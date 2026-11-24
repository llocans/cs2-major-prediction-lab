import { describe, expect, it } from 'vitest'
import { type MarketData, marketChance, marketQuote, teamStageMatches } from './market.ts'

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

  it('prefers odds read before the round, falls back to the closing line and names the source', () => {
    const both: MarketData = {
      ...data,
      benchmarks: [
        { ...data.benchmarks[0], source: { name: 'OddsPortal match-winner odds, mean' } },
        {
          stageId: 's1',
          round: 2,
          teamA: 'a',
          teamB: 'd',
          pA: 0.7,
          source: { name: 'OddsPortal match-winner odds, mean' },
        },
      ] as MarketData['benchmarks'],
      bookmakerOdds: [
        {
          stageId: 's1',
          round: 1,
          teamA: 'b',
          teamB: 'a',
          pA: 0.35,
          source: { name: 'CSGOEmpire match-winner odds, margin removed' },
        },
      ],
    }
    expect(marketQuote(both, 's1', 1, 'a', 'b')).toEqual({ p: 0.65, source: 'CSGOEmpire' })
    expect(marketQuote(both, 's1', 2, 'a', 'd')).toEqual({ p: 0.7, source: 'OddsPortal avg' })
    expect(marketQuote(both, 's1', 3, 'a', 'd')).toBeUndefined()
  })

  it("lists a team's stage matches with model, market and result", () => {
    expect(teamStageMatches(data, 's1', 'a')).toEqual([
      { round: 1, opponent: 'b', model: 0.55, market: 0.6, result: 'L' },
      { round: 2, opponent: 'd', model: undefined, market: undefined, result: 'W' },
    ])
  })
})
