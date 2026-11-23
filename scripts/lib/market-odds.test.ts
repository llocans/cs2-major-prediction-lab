import { describe, expect, it } from 'vitest'
import type { MatchResult } from '../../data/schemas/index.ts'
import {
  benchmarkEntry,
  closingPrice,
  closingProbability,
  type MarketOddsConfig,
  matchFixtures,
  matchTeam,
  normalizeTeamName,
  type OddsPapiFixture,
  OddsPapiHistorical,
  parseFixtures,
  resultsWithoutBenchmark,
} from './market-odds.ts'

const config: MarketOddsConfig = {
  provider: 'oddspapi',
  tournamentId: 51216,
  marketId: '171',
  outcomes: ['171', '172'],
  bookmakers: ['pinnacle+30'],
  source: { name: 'test', retrievedAt: '2026-11-23' },
}
const teams = [
  { id: 'heroic', names: ['HEROIC', 'Heroic'] },
  { id: 'imperial', names: ['Imperial', 'Imperial Esports'] },
  { id: '9z', names: ['9z'] },
  { id: 'bc-game', names: ['BC.Game', 'GOSH'] },
  { id: 'wildcard', names: ['Wildcard'] },
]
const result = (teamA: string, teamB: string, day = '2026-11-24'): MatchResult => ({
  id: `stage-1-r1-${teamA}-${teamB}`,
  stageId: 'stage-1',
  round: 1,
  teamA,
  teamB,
  format: 'bo1',
  maps: [{ map: 'nuke', scoreA: 13, scoreB: 7 }],
  winner: teamA,
  source: { name: 'test', retrievedAt: day },
})
const fixture = (p1: string, p2: string, startTime: string, statusId = 2): OddsPapiFixture => ({
  fixtureId: `id-${p1}-${p2}-${startTime}`,
  participant1Name: p1,
  participant2Name: p2,
  startTime,
  trueStartTime: null,
  statusId,
})
/** Shaped like the docs' example: newest change first, one entry after the start. */
const historical = OddsPapiHistorical.parse({
  fixtureId: 'x',
  bookmakers: {
    'pinnacle+30': {
      markets: {
        '171': {
          outcomes: {
            '171': {
              players: {
                '0': [
                  {
                    createdAt: '2026-11-24T06:05:00.000+00:00',
                    price: 1.2,
                    limit: 1,
                    active: true,
                  },
                  {
                    createdAt: '2026-11-24T05:55:00.000+00:00',
                    price: 1.6,
                    limit: 1,
                    active: true,
                  },
                  {
                    createdAt: '2026-11-23T12:00:00.000+00:00',
                    price: 1.7,
                    limit: 1,
                    active: false,
                  },
                ],
              },
            },
            '172': {
              players: {
                '0': [
                  {
                    createdAt: '2026-11-24T05:50:00.000+00:00',
                    price: 2.5,
                    limit: 1,
                    active: true,
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
})

describe('team names', () => {
  it('normalizes provider names', () => {
    expect(normalizeTeamName('Imperial eSports')).toBe('imperial')
    expect(normalizeTeamName('9z Team')).toBe('9z')
    expect(normalizeTeamName('BC.Game')).toBe('bcgame')
    expect(normalizeTeamName('Wildcard Gaming')).toBe('wildcard')
  })
  it('matches only one team, or none', () => {
    expect(matchTeam('Imperial eSports', teams)).toBe('imperial')
    expect(matchTeam('BC.Game', teams)).toBe('bc-game')
    expect(matchTeam('Team Spirit', teams)).toBeUndefined()
    expect(matchTeam('Esports', teams)).toBeUndefined()
  })
})

describe('closing line', () => {
  it('takes the last price before the start, ignoring later ones', () => {
    const entries =
      historical.bookmakers['pinnacle+30']?.markets['171']?.outcomes['171']?.players['0'] ?? []
    expect(closingPrice(entries, '2026-11-24T06:00:00.000Z')?.price).toBe(1.6)
    expect(closingPrice(entries, '2026-11-23T00:00:00.000Z')).toBeUndefined()
  })
  it('removes the margin', () => {
    const closing = closingProbability(historical, config, '2026-11-24T06:00:00.000Z')
    // 1/1.6 = 0.625, 1/2.5 = 0.4: 0.625 / 1.025
    expect(closing?.p1).toBeCloseTo(0.625 / 1.025, 6)
    expect(closing?.bookmakers).toEqual(['pinnacle+30'])
    expect(closing?.observedAt).toBe('2026-11-24T05:55:00.000+00:00')
  })
  it('skips a bookmaker without both prices', () => {
    const one = { ...config, outcomes: ['171', '999'] as [string, string] }
    expect(closingProbability(historical, one, '2026-11-24T06:00:00.000Z')).toBeUndefined()
  })
})

describe('fixtures to results', () => {
  it('pairs by teams in either order, only settled, near the day it was logged', () => {
    const results = [result('imperial', 'heroic'), result('9z', 'wildcard')]
    const { matched, unmatched } = matchFixtures(
      results,
      [
        fixture('Heroic', 'Imperial eSports', '2026-11-24T06:00:00.000Z'),
        fixture('9z Team', 'Wildcard Gaming', '2026-11-24T09:00:00.000Z', 1),
        // The same pair in an earlier event: too far from the logged day.
        fixture('Heroic', 'Imperial eSports', '2026-10-01T06:00:00.000Z'),
        fixture('Team Spirit', 'Heroic', '2026-11-24T06:00:00.000Z'),
      ],
      teams,
    )
    expect(matched).toHaveLength(1)
    expect(matched[0]?.fixture.startTime).toBe('2026-11-24T06:00:00.000Z')
    expect(matched[0]?.teamAIsParticipant1).toBe(false)
    expect(unmatched).toEqual(['9z v wildcard', 'provider team "Team Spirit" not matched'])
  })

  it('turns a match into a benchmark entry for our teamA', () => {
    const { matched } = matchFixtures(
      [result('imperial', 'heroic')],
      [fixture('Heroic', 'Imperial eSports', '2026-11-24T06:00:00.000Z')],
      teams,
    )
    const match = matched[0]
    if (!match) throw new Error('no match')
    const entry = benchmarkEntry(match, historical, config)
    // Heroic is participant1 at 0.6098, so Imperial (our teamA) is 0.3902.
    expect(entry?.teamA).toBe('imperial')
    expect(entry?.pA).toBeCloseTo(1 - 0.625 / 1.025, 3)
    expect(entry?.observedAt).toBe('2026-11-24T05:55:00.000Z')
  })

  it('knows which results still lack a benchmark', () => {
    const missing = resultsWithoutBenchmark(
      [result('imperial', 'heroic'), result('9z', 'wildcard')],
      [
        {
          stageId: 'stage-1',
          round: 1,
          teamA: 'heroic',
          teamB: 'imperial',
          pA: 0.6,
          source: { name: 'x', retrievedAt: '2026-11-23' },
          observedAt: '2026-11-23T12:00:00Z',
        },
      ],
    )
    expect(missing.map((r) => r.teamA)).toEqual(['9z'])
  })
})

describe('review cases', () => {
  it('has no closing price without a usable start time', () => {
    expect(closingPrice([{ createdAt: '2026-11-24T05:00:00Z', price: 1.5 }], 'TBD')).toBeUndefined()
  })

  it('skips suspended entries and missing prices', () => {
    const entries = [
      { createdAt: '2026-11-24T05:59:00Z', price: null },
      { createdAt: '2026-11-24T05:58:00Z', price: 1.4, active: false },
      { createdAt: '2026-11-24T05:50:00Z', price: 1.55, active: true },
    ]
    expect(closingPrice(entries, '2026-11-24T06:00:00Z')?.price).toBe(1.55)
    const parsed = OddsPapiHistorical.parse({
      fixtureId: 'x',
      bookmakers: { 'pinnacle+30': {}, other: { markets: { '171': {} } } },
    })
    expect(closingProbability(parsed, config, '2026-11-24T06:00:00Z')).toBeUndefined()
  })

  it('reads a bare or wrapped fixtures list and skips entries that do not fit', () => {
    const good = fixture('Heroic', 'Imperial eSports', '2026-11-24T06:00:00.000Z')
    const tbd = { ...good, fixtureId: 'tbd', participant2Name: null }
    expect(parseFixtures([good, tbd])).toEqual([good])
    expect(parseFixtures({ data: [good] })).toEqual([good])
    expect(() => parseFixtures({ error: 'x' })).toThrow(/expected a list/)
  })

  it('never gives a result the odds of a rematch on a later day', () => {
    const { matched, unmatched } = matchFixtures(
      [result('imperial', 'heroic', '2026-11-27')],
      [
        fixture('Heroic', 'Imperial eSports', '2026-11-28T06:00:00.000Z'),
        fixture('Heroic', 'Imperial eSports', '2026-11-26T23:30:00.000Z'),
      ],
      teams,
    )
    // Logged on the 27th: the match that began just before midnight, not the next day's rematch.
    expect(matched[0]?.fixture.startTime).toBe('2026-11-26T23:30:00.000Z')
    expect(unmatched).toEqual([])
  })
})
