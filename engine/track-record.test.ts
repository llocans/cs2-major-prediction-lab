import { describe, expect, it } from 'vitest'
import type { MatchResult } from '../data/schemas/results.ts'
import type { Snapshot } from '../data/schemas/snapshot.ts'
import { stageTrackRecord } from './track-record.ts'

const source = { name: 'test', retrievedAt: '2026-11-24' }
const snapshot = (round: number, matches: Array<[string, string, number]>): Snapshot => ({
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
  matches: matches.map(([teamA, teamB, pA]) => ({
    teamA,
    teamB,
    format: 'bo1',
    pA,
    confidence: 'medium',
    reason: '',
  })),
  teams: [
    {
      teamId: 'a',
      record: '0-0',
      p30: 0.2,
      pAdvance: 0.7,
      p03: 0.05,
      pEliminated: 0.3,
      confidence: 'medium',
      reason: '',
    },
    {
      teamId: 'b',
      record: '0-0',
      p30: 0.1,
      pAdvance: 0.3,
      p03: 0.2,
      pEliminated: 0.7,
      confidence: 'medium',
      reason: '',
    },
  ],
})
const result = (round: number, teamA: string, teamB: string, winner: string): MatchResult => ({
  id: `${round}-${teamA}-${teamB}`,
  stageId: 's1',
  round,
  teamA,
  teamB,
  format: 'bo1',
  maps: [{ map: 'nuke', scoreA: winner === teamA ? 13 : 9, scoreB: winner === teamA ? 9 : 13 }],
  winner,
  source,
})

describe('stageTrackRecord', () => {
  const snapshots = [
    snapshot(1, [
      ['9z', 'lvg', 0.63],
      ['a', 'b', 0.7],
    ]),
    snapshot(2, [['a', 'c', 0.55]]),
  ]
  const results = [result(1, '9z', 'lvg', 'lvg'), result(1, 'b', 'a', 'a')]

  it('marks hits, misses and upsets against the snapshot saved before the round', () => {
    const record = stageTrackRecord('s1', snapshots, results)
    expect(record.rounds).toHaveLength(2)
    expect(record.rounds[1]?.pendingMatches).toHaveLength(1)
    expect(record.rounds[1]?.brier).toBeUndefined()
    const [upset, favourite] = record.rounds[0]?.matches ?? []
    expect(upset).toMatchObject({ winner: 'lvg', hit: false, upset: true })
    expect(upset?.pWinner).toBeCloseTo(0.37)
    expect(favourite).toMatchObject({ winner: 'a', hit: true, upset: false })
    expect(record.upsets.map((m) => m.winner)).toEqual(['lvg'])
    expect(record.pending).toBe(1)
    expect(record.brier).toBeCloseTo((0.63 ** 2 + 0.3 ** 2) / 2)
    expect(record.hitRate).toBe(0.5)
  })

  it('scores pre-stage advance odds only when the advancers are given', () => {
    expect(stageTrackRecord('s1', snapshots, results).advance).toBeUndefined()
    const done = stageTrackRecord('s1', snapshots, results, [], new Set(['a']))
    expect(done.advance?.brier).toBeCloseTo((0.3 ** 2 + 0.3 ** 2) / 2)
  })

  it('compares with market odds when logged', () => {
    const market = [
      {
        stageId: 's1',
        round: 1,
        teamA: 'lvg',
        teamB: '9z',
        pA: 0.45,
        source,
        observedAt: '2026-11-23T00:00:00Z',
      },
    ]
    const record = stageTrackRecord('s1', snapshots, results, market)
    expect(record.rounds[0]?.matches[0]?.marketPA).toBeCloseTo(0.55)
    expect(record.market?.matches).toBe(1)
  })
})
