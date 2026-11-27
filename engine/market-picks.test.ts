import { describe, expect, it } from 'vitest'
import type { BookmakerOdds } from '../data/schemas/bookmaker-odds.ts'
import type { MatchResult } from '../data/schemas/results.ts'
import type { Snapshot } from '../data/schemas/snapshot.ts'
import { marginFree, stageMarketPicks } from './market-picks.ts'

const RULE = { minEdge: 0.05, skipLittleData: true }

const source = { name: 'Book', retrievedAt: '2026-11-24' }

const snapshot = (round: number, matches: Array<[string, string, number, string?]>): Snapshot => ({
  schemaVersion: 1,
  eventId: 'e',
  stageId: 's1',
  beforeRound: round,
  createdAt: '2026-11-24T00:00:00Z',
  modelVersion: 't',
  seed: 1,
  runs: 100,
  maxStandardError: 0.01,
  resultsCount: 0,
  ratingsAsOf: '2026-11-24T00:00:00Z',
  matches: matches.map(([teamA, teamB, pA, reason = '']) => ({
    teamA,
    teamB,
    format: 'bo1',
    pA,
    confidence: 'medium',
    reason,
  })),
  teams: [],
})

const odds = (round: number, teamA: string, teamB: string, pA: number) =>
  ({
    stageId: 's1',
    round,
    teamA,
    teamB,
    pA,
    source,
  }) satisfies BookmakerOdds['entries'][number]

const result = (
  round: number,
  teamA: string,
  teamB: string,
  scores: Array<[number, number]>,
): MatchResult => {
  const winsA = scores.filter(([a, b]) => a > b).length
  return {
    id: `${round}-${teamA}-${teamB}`,
    stageId: 's1',
    round,
    teamA,
    teamB,
    format: scores.length === 1 ? 'bo1' : 'bo3',
    maps: scores.map(([scoreA, scoreB]) => ({ map: 'nuke', scoreA, scoreB })),
    winner: winsA > scores.length - winsA ? teamA : teamB,
    source,
  }
}

describe('marginFree', () => {
  it('scales both implied probabilities to sum to 1', () => {
    // 1/1.50 = 0.667 and 1/2.66 = 0.376: a 4.3% margin, removed.
    expect(marginFree(1.5, 2.66)).toBeCloseTo(0.639, 3)
    expect(marginFree(2, 2)).toBe(0.5)
  })

  it('rejects odds that are not decimal odds', () => {
    expect(() => marginFree(1, 3)).toThrow(/above 1/)
  })
})

describe('stageMarketPicks', () => {
  it('picks the side the model rates at least 5 points above the market', () => {
    const stage = stageMarketPicks(
      's1',
      RULE,
      [snapshot(1, [['a', 'b', 0.57]])],
      [odds(1, 'a', 'b', 0.65)],
      [result(1, 'a', 'b', [[6, 13]])],
    )
    const [match] = stage.rounds[0]?.matches ?? []
    expect(match?.pick).toBe('b')
    expect(match?.edge?.value).toBeCloseTo(0.08)
    expect(match?.pickWon).toBe(true)
    expect(match?.result).toEqual({ winner: 'b', score: '13-6' })
    expect(stage).toMatchObject({ picks: 1, won: 1, lost: 0, pending: 0 })
    // b at a margin-free 35%: odds 1/0.35 = 2.857, so a 1-unit win pays 1.857.
    expect(match?.units).toBeCloseTo(1 / 0.35 - 1)
    expect(stage.units).toBeCloseTo(1 / 0.35 - 1)
  })

  it('reads odds logged with the teams in the other order', () => {
    const stage = stageMarketPicks(
      's1',
      RULE,
      [snapshot(1, [['a', 'b', 0.7]])],
      [odds(1, 'b', 'a', 0.4)],
      [],
    )
    const [match] = stage.rounds[0]?.matches ?? []
    expect(match?.marketA).toBeCloseTo(0.6)
    expect(match?.pick).toBe('a')
    expect(match?.pickWon).toBeUndefined()
    expect(match?.units).toBeUndefined()
    expect(stage.pending).toBe(1)
    expect(stage.units).toBe(0)
  })

  it('skips small edges, little tier-1 data and matches without odds', () => {
    const stage = stageMarketPicks(
      's1',
      RULE,
      [
        snapshot(2, [
          ['a', 'b', 0.52],
          ['c', 'd', 0.3, 'c +10 rating; little tier-1 data for d'],
          ['e', 'f', 0.5],
        ]),
      ],
      [odds(2, 'a', 'b', 0.5), odds(2, 'c', 'd', 0.15)],
      [],
    )
    expect(stage.rounds[0]?.matches.map((m) => m.skip)).toEqual([
      'small-edge',
      'little-data',
      'no-odds',
    ])
    expect(stage.picks).toBe(0)
    // An older snapshot said medium; a little-data match is always shown as low.
    expect(stage.rounds[0]?.matches.map((m) => m.confidence)).toEqual(['medium', 'low', 'medium'])
  })

  it('scores a series by maps from the winner side and leaves rounds without odds out', () => {
    const stage = stageMarketPicks(
      's1',
      RULE,
      [snapshot(1, [['a', 'b', 0.5]]), snapshot(3, [['a', 'b', 0.3]])],
      [odds(3, 'a', 'b', 0.5)],
      [
        result(3, 'a', 'b', [
          [13, 9],
          [7, 13],
          [13, 11],
        ]),
      ],
    )
    expect(stage.rounds.map((r) => r.round)).toEqual([3])
    const [match] = stage.rounds[0]?.matches ?? []
    expect(match?.result).toEqual({ winner: 'a', score: '2-1' })
    expect(match?.pick).toBe('b')
    expect(match?.pickWon).toBe(false)
    expect(match?.units).toBe(-1)
    expect(stage.rounds[0]).toMatchObject({
      readOn: '2026-11-24',
      sources: ['Book'],
      lost: 1,
      units: -1,
    })
  })

  it("uses the stage's own rule: a higher minEdge or keeping little-data matches", () => {
    const args = [
      [
        snapshot(1, [
          ['a', 'b', 0.57],
          ['c', 'd', 0.3, 'c +10 rating; little tier-1 data for d'],
        ]),
      ],
      [odds(1, 'a', 'b', 0.65), odds(1, 'c', 'd', 0.15)],
      [],
    ] as const
    const strict = stageMarketPicks('s1', { minEdge: 0.1, skipLittleData: true }, ...args)
    expect(strict.rounds[0]?.matches.map((m) => m.skip)).toEqual(['small-edge', 'little-data'])
    const loose = stageMarketPicks('s1', { minEdge: 0.05, skipLittleData: false }, ...args)
    expect(loose.rounds[0]?.matches.map((m) => m.pick)).toEqual(['b', 'c'])
    expect(loose.rule).toEqual({ minEdge: 0.05, skipLittleData: false })
  })
})
