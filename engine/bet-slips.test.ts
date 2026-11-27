import { describe, expect, it } from 'vitest'
import {
  buildSlips,
  legChance,
  type SlipCandidate,
  slipOutcome,
  slipPool,
  winnersByPair,
} from './bet-slips.ts'
import type { MarketMatch } from './market-picks.ts'

const RULE = { maxLegs: 4, safeMinChance: 0.5 }

const cand = (
  pick: string,
  confidence: SlipCandidate['confidence'],
  model: number,
  market: number,
  odds = 1 / market,
): SlipCandidate => ({ teamA: pick, teamB: `${pick}-opp`, pick, confidence, model, market, odds })

describe('legChance', () => {
  it('uses the model for High/Medium and halfway to the market for Low', () => {
    expect(legChance({ confidence: 'medium', model: 0.6, market: 0.5 })).toBe(0.6)
    expect(legChance({ confidence: 'low', model: 0.52, market: 0.37 })).toBeCloseTo(0.445)
  })
})

describe('buildSlips', () => {
  it('splits expected winners from underdogs and Low picks (Stage 2 R1 shape)', () => {
    const { slips, left } = buildSlips(
      [
        cand('flyquest', 'medium', 0.373, 0.32, 3.0),
        cand('parivision', 'low', 0.519, 0.369, 2.6),
        cand('astralis', 'medium', 0.613, 0.559, 1.72),
        cand('mibr', 'medium', 0.581, 0.466, 2.06),
      ],
      RULE,
    )
    expect(slips.map((s) => [s.kind, s.legs.map((l) => l.pick)])).toEqual([
      ['safer', ['astralis', 'mibr']],
      ['riskier', ['parivision', 'flyquest']],
    ])
    expect(left).toEqual([])
  })

  it('leaves out a pick with no value at the real odds', () => {
    // 5 points above the margin-free market, but the bookmaker's margin eats it: 0.55 × 1.75 < 1.
    const { slips, left } = buildSlips([cand('a', 'high', 0.55, 0.5, 1.75)], RULE)
    expect(slips).toEqual([])
    expect(left).toEqual([
      { teamA: 'a', teamB: 'a-opp', pick: 'a', chance: 0.55, reason: 'no-value' },
    ])
  })

  it('keeps a Low pick out of the safer slip even when the model expects it to win', () => {
    const { slips } = buildSlips([cand('a', 'low', 0.7, 0.55, 2)], RULE)
    expect(slips.map((s) => s.kind)).toEqual(['riskier'])
  })

  it('caps slips at maxLegs, moves overflow on and leaves the rest over the limit', () => {
    const safe = ['s1', 's2', 's3'].map((p, i) => cand(p, 'high', 0.7 - i * 0.01, 0.6))
    const risky = ['r1', 'r2', 'r3', 'r4'].map((p, i) => cand(p, 'medium', 0.4 - i * 0.01, 0.3))
    const { slips, left } = buildSlips([...risky, ...safe], { maxLegs: 2, safeMinChance: 0.5 })
    expect(slips.map((s) => [s.kind, s.legs.map((l) => l.pick)])).toEqual([
      ['safer', ['s1', 's2']],
      ['riskier', ['s3', 'r1']],
      ['extra', ['r2', 'r3']],
    ])
    expect(left.map((l) => [l.pick, l.reason])).toEqual([['r4', 'over-limit']])
  })
})

const match = (teamA: string, teamB: string, modelA: number, marketA: number, pick?: string) =>
  ({
    teamA,
    teamB,
    format: 'bo1',
    confidence: 'medium',
    reason: '',
    modelA,
    marketA,
    ...(pick ? { pick } : {}),
  }) as MarketMatch

describe('slipPool', () => {
  const matches = [
    match('a', 'b', 0.6, 0.5, 'a'),
    match('c', 'd', 0.3, 0.4, 'd'),
    match('e', 'f', 0.5, 0.5),
    match('g', 'h', 0.4, 0.2, 'g'),
  ]
  const odds = [
    {
      teamA: 'a',
      teamB: 'b',
      oddsA: 1.9,
      oddsB: 1.9,
      observedAt: '2026-11-27T18:00:00Z',
      startsAt: '2026-11-28T04:00:00Z',
    },
    // Logged with the teams the other way round.
    {
      teamA: 'd',
      teamB: 'c',
      oddsA: 1.6,
      oddsB: 2.4,
      observedAt: '2026-11-27T18:00:00Z',
      startsAt: '2026-11-28T05:00:00Z',
    },
    { teamA: 'e', teamB: 'f', oddsA: 1.9, oddsB: 1.9, observedAt: '2026-11-27T18:00:00Z' },
    // Read after its kickoff: never used.
    {
      teamA: 'g',
      teamB: 'h',
      oddsA: 4,
      oddsB: 1.2,
      observedAt: '2026-11-28T06:30:00Z',
      startsAt: '2026-11-28T06:00:00Z',
    },
  ]

  it('takes value picks read before kickoff, with the odds on the picked side', () => {
    const pool = slipPool(matches, odds, [], '2026-11-27T18:05:00Z')
    expect(pool.map((c) => [c.pick, c.model, c.market, c.odds])).toEqual([
      ['a', 0.6, 0.5, 1.9],
      ['d', 0.7, 0.6, 1.6],
    ])
  })

  it('drops matches already in a slip or already started', () => {
    const slipped = [{ teamA: 'b', teamB: 'a', pick: 'a', chance: 0.6 }]
    const pool = slipPool(matches, odds, slipped, '2026-11-28T04:30:00Z')
    expect(pool.map((c) => c.pick)).toEqual(['d'])
    expect(slipPool(matches, odds, [], '2026-11-28T05:00:00Z')).toEqual([])
  })
})

describe('slipOutcome', () => {
  const slip = {
    kind: 'safer' as const,
    legs: [
      { teamA: 'a', teamB: 'b', pick: 'a', chance: 0.6 },
      { teamA: 'c', teamB: 'd', pick: 'd', chance: 0.5 },
    ],
  }
  const odds = (leg: { pick: string }) => (leg.pick === 'a' ? 1.9 : 2.1)
  const results = (winners: Array<[string, string, string]>) =>
    winnersByPair(
      winners.map(([teamA, teamB, winner]) => ({ stageId: 's', round: 1, teamA, teamB, winner })),
      's',
      1,
    )

  it('is pending until decided, lost on the first losing leg, won when all win', () => {
    expect(slipOutcome(slip, results([['a', 'b', 'a']]), odds)).toMatchObject({
      status: 'pending',
      chanceAll: 0.3,
    })
    expect(slipOutcome(slip, results([['a', 'b', 'b']]), odds)).toMatchObject({
      status: 'lost',
      units: -1,
    })
    const won = slipOutcome(
      slip,
      results([
        ['a', 'b', 'a'],
        ['d', 'c', 'd'],
      ]),
      odds,
    )
    expect(won.status).toBe('won')
    expect(won.odds).toBeCloseTo(3.99)
    expect(won.units).toBeCloseTo(2.99)
  })

  it('leaves odds and units out when a leg has no odds', () => {
    const won = slipOutcome(
      slip,
      results([
        ['a', 'b', 'a'],
        ['c', 'd', 'd'],
      ]),
      () => undefined,
    )
    expect(won).toEqual({ chanceAll: 0.3, status: 'won' })
  })
})
