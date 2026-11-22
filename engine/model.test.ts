import { describe, expect, it } from 'vitest'
import type { VetoProcedure } from '../data/schemas/event-config.ts'
import type { ModelParams, Ratings } from '../data/schemas/model.ts'
import { buildMatchModel } from './match-model.ts'
import { mapStrengthFromSample, unplayedMapStrength } from './ratings/map-strength.ts'
import { priorRating } from './ratings/prior.ts'
import { winProbability } from './ratings/probability.ts'
import { updateRatings } from './ratings/update.ts'
import { createRng } from './rng.ts'
import { seriesWinProbability } from './series.ts'
import { simulateSwiss } from './simulate-swiss.ts'
import type { SwissRules } from './swiss/types.ts'
import { runVeto } from './veto.ts'

const params: ModelParams = {
  schemaVersion: 1,
  version: 'test',
  scale: 400,
  prior: {
    base: 1500,
    vrsCenter: 1500,
    perVrsPoint: 0.6,
    rd: 60,
    coldStartRd: 110,
    coldStartSeries: 8,
  },
  maps: { shrinkMaps: 12, maxOffset: 120, newMapRd: 120, unplayedPenalty: 40, unplayedMinMaps: 15 },
  update: { k: 24, formatWeight: { bo1: 0.75, bo3: 1, bo5: 1 }, roundDiffWeight: 0.5, minRd: 45 },
  veto: { temperature: 25 },
  sim: { runs: 12000, seed: 1 },
  modifiers: { maxAbs: 40 },
  retuneCapPerStage: 0.1,
}
const pool = ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke']
const source = { name: 'test', retrievedAt: '2026-11-21' }
const bo1: VetoProcedure = {
  steps: [
    { team: 'A', action: 'ban', count: 2 },
    { team: 'B', action: 'ban', count: 3 },
    { team: 'A', action: 'ban', count: 1 },
  ],
  source,
}
const bo3: VetoProcedure = {
  steps: [
    { team: 'A', action: 'ban', count: 1 },
    { team: 'B', action: 'ban', count: 1 },
    { team: 'A', action: 'pick', count: 1 },
    { team: 'B', action: 'pick', count: 1 },
    { team: 'B', action: 'ban', count: 1 },
    { team: 'A', action: 'ban', count: 1 },
  ],
  source,
}

function ratingsFor(values: Record<string, number>, rd = 60): Ratings {
  return {
    schemaVersion: 1,
    asOf: '2026-11-21T00:00:00Z',
    reason: 'test',
    teams: Object.fromEntries(
      Object.entries(values).map(([id, rating]) => [
        id,
        { rating, rd, maps: {}, sources: [source] },
      ]),
    ),
  }
}

describe('rng', () => {
  it('is deterministic and uniform enough', () => {
    const a = createRng(42)
    const b = createRng(42)
    const xs = Array.from({ length: 1000 }, () => a.next())
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()))
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    expect(mean).toBeGreaterThan(0.45)
    expect(mean).toBeLessThan(0.55)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThan(1)
  })
})

describe('ratings', () => {
  it('400 points is 10:1 odds with no uncertainty', () => {
    expect(winProbability(400, 0, 400)).toBeCloseTo(10 / 11, 6)
    expect(winProbability(0, 3600, 400)).toBe(0.5)
  })

  it('uncertainty pulls probabilities toward 50%', () => {
    expect(winProbability(100, 2 * 110 ** 2, 400)).toBeLessThan(
      winProbability(100, 2 * 60 ** 2, 400),
    )
  })

  it('maps VRS points to the prior and widens rd on cold start', () => {
    expect(priorRating({ vrsPoints: 1600, tier1Series: 30 }, params)).toEqual({
      rating: 1560,
      rd: 60,
    })
    expect(priorRating({ vrsPoints: 1400, tier1Series: 3 }, params).rd).toBe(110)
  })

  it('shrinks map offsets toward 0 for small samples', () => {
    const small = mapStrengthFromSample({ won: 3, played: 3 }, { won: 10, played: 20 }, params)
    const large = mapStrengthFromSample({ won: 20, played: 30 }, { won: 50, played: 100 }, params)
    expect(small.offset).toBeGreaterThan(0)
    expect(small.offset).toBeLessThan(large.offset)
    expect(mapStrengthFromSample({ won: 0, played: 0 }, { won: 5, played: 9 }, params)).toEqual({
      offset: 0,
      rd: 120,
      n: 0,
    })
  })

  it('treats a map never played in a large sample as a ban', () => {
    expect(unplayedMapStrength(40, params)).toEqual({ offset: -40, rd: 120, n: 0 })
    expect(unplayedMapStrength(6, params)).toBeUndefined()
  })

  it('judges a result against the prediction including modifiers', () => {
    const before = ratingsFor({ x: 1500, y: 1500 })
    const match = {
      teamA: 'x',
      teamB: 'y',
      format: 'bo3' as const,
      maps: [{ map: 'nuke', scoreA: 13, scoreB: 9 }],
    }
    const penalty = [
      {
        id: 'x-standin',
        teamId: 'x',
        delta: -30,
        reason: 'stand-in for the test',
        source,
        createdAt: '2026-11-01',
        expires: '2026-12-13',
      },
    ]
    const plain = updateRatings(before, match, params, '2026-11-24T06:00:00Z', 't')
    const withModifier = updateRatings(before, match, params, '2026-11-24T06:00:00Z', 't', penalty)
    // x was predicted weaker, so its win is a bigger surprise and moves its rating more.
    expect((withModifier.teams.x?.rating ?? 0) - 1500).toBeGreaterThan(
      (plain.teams.x?.rating ?? 0) - 1500,
    )
  })

  it('moves the winner up and the loser down, Bo1 less than Bo3', () => {
    const before = ratingsFor({ x: 1500, y: 1500 })
    const map = { map: 'nuke', scoreA: 13, scoreB: 7 }
    const afterBo1 = updateRatings(
      before,
      { teamA: 'x', teamB: 'y', format: 'bo1', maps: [map] },
      params,
      '2026-11-24T06:00:00Z',
      't',
    )
    const afterBo3 = updateRatings(
      before,
      { teamA: 'x', teamB: 'y', format: 'bo3', maps: [map] },
      params,
      '2026-11-24T06:00:00Z',
      't',
    )
    const gainBo1 = (afterBo1.teams.x?.rating ?? 0) - 1500
    const gainBo3 = (afterBo3.teams.x?.rating ?? 0) - 1500
    expect(gainBo1).toBeGreaterThan(0)
    expect(gainBo3).toBeGreaterThan(gainBo1)
    expect(afterBo1.teams.y?.rating).toBeLessThan(1500)
    expect(afterBo1.teams.x?.rd).toBeLessThan(60)
    expect(afterBo1.teams.x?.maps.nuke?.n).toBe(1)
    expect(before.teams.x?.rating).toBe(1500)
  })
})

describe('veto', () => {
  it('Bo1 leaves one map; Bo3 gives two picks and a decider', () => {
    const advantage = () => 0
    expect(runVeto(bo1.steps, pool, advantage, 0)).toHaveLength(1)
    expect(runVeto(bo3.steps, pool, advantage, 0)).toHaveLength(3)
  })

  it('greedy teams ban their worst map and pick their best remaining map', () => {
    const forA: Record<string, number> = { nuke: 100, mirage: -100, ancient: 50, anubis: -50 }
    const advantage = (side: 'A' | 'B', map: string) => (side === 'A' ? 1 : -1) * (forA[map] ?? 0)
    // A bans mirage (its worst), B bans nuke (A's best), A picks ancient, B picks anubis.
    const maps = runVeto(bo3.steps, pool, advantage, 0)
    expect(maps.slice(0, 2)).toEqual(['ancient', 'anubis'])
    expect(maps).not.toContain('nuke')
    expect(maps).not.toContain('mirage')
  })
})

describe('match model', () => {
  it('gives the same map win probability whichever order a pair is first asked in', () => {
    // Many rating gaps: the old cache only differed in the last bit for some of them.
    const values = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`t${i}`, 1400 + ((i * 37.3) % 300)]),
    )
    const ratings = ratingsFor(values, 71.7)
    const ids = Object.keys(values)
    const forward = buildMatchModel(ratings, [], params, pool, '2026-11-21')
    const backward = buildMatchModel(ratings, [], params, pool, '2026-11-21')
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue
        forward.mapWin(a, b, 'nuke')
        backward.mapWin(b, a, 'nuke')
      }
    }
    for (const a of ids) {
      for (const b of ids) {
        if (a !== b) expect(forward.mapWin(a, b, 'nuke')).toBe(backward.mapWin(a, b, 'nuke'))
      }
    }
  })
})

describe('series', () => {
  it('Bo3 probability matches p²(3 − 2p) for equal maps', () => {
    expect(seriesWinProbability([0.6, 0.6, 0.6], 'bo3')).toBeCloseTo(0.36 * 1.8, 10)
    expect(seriesWinProbability([0.7], 'bo1')).toBe(0.7)
  })
})

describe('simulateSwiss', () => {
  const seeds = Array.from({ length: 16 }, (_, i) => `t${i + 1}`)
  const rules: SwissRules = {
    winsToAdvance: 3,
    lossesToEliminate: 3,
    initialPairing: [
      [1, 9],
      [2, 10],
      [3, 11],
      [4, 12],
      [5, 13],
      [6, 14],
      [7, 15],
      [8, 16],
    ],
  }
  const ratings = ratingsFor(Object.fromEntries(seeds.map((id, i) => [id, 1650 - i * 20])))
  const model = buildMatchModel(ratings, [], params, pool, '2026-11-21')
  const base = {
    seeds,
    rules,
    format: { default: 'bo1', decider: 'bo3' } as const,
    veto: { bo1, bo3 },
    model,
    played: [],
    runs: 12000,
    seed: 7,
  }

  it('is deterministic for a seed and meets the standard error target', () => {
    const first = simulateSwiss(base)
    const second = simulateSwiss(base)
    expect(second).toEqual(first)
    expect(first.maxStandardError).toBeLessThan(0.005)
    expect(first.upcoming).toHaveLength(8)
  }, 60_000) // 24,000 simulated stages: slower machines (cloud runners) need more than 5 s

  it('advances exactly 8 teams per run and favors stronger teams', () => {
    const result = simulateSwiss({ ...base, runs: 3000 })
    const total = result.teams.reduce((sum, team) => sum + team.pAdvance, 0)
    expect(total).toBeCloseTo(8, 6)
    const p1 = result.teams.find((t) => t.teamId === 't1')?.pAdvance ?? 0
    const p16 = result.teams.find((t) => t.teamId === 't16')?.pAdvance ?? 1
    expect(p1).toBeGreaterThan(p16)
  })

  it('respects real results', () => {
    const played = rules.initialPairing.map(([a, b]) => ({
      round: 1,
      teamA: `t${a}`,
      teamB: `t${b}`,
      winner: `t${b}`,
    }))
    const result = simulateSwiss({ ...base, runs: 2000, played })
    expect(result.currentRound).toBe(2)
    expect(result.teams.find((t) => t.teamId === 't1')?.p30).toBe(0)
    expect(result.teams.find((t) => t.teamId === 't9')?.p03).toBe(0)
  })
})
