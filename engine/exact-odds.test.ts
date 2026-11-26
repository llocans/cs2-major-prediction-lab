import { describe, expect, it } from 'vitest'
import type { VetoProcedure } from '../data/schemas/event-config.ts'
import type { ModelParams, Ratings } from '../data/schemas/model.ts'
import { buildMatchModel } from './match-model.ts'
import { createRng } from './rng.ts'
import { seriesPlayer, seriesWinChance } from './series.ts'
import { simulateSwiss } from './simulate-swiss.ts'
import { pairRound } from './swiss/pairing.ts'
import type { SwissRules } from './swiss/types.ts'
import { runVeto, vetoOutcomes } from './veto.ts'

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
const veto = { bo1, bo3 }

/** Teams with uneven map pools, so the veto matters. */
function ratingsFor(values: Record<string, number>): Ratings {
  const offsets = (i: number) =>
    Object.fromEntries(
      pool.map((map, m) => [map, { offset: ((i * 37 + m * 53) % 120) - 60, rd: 60, n: 10 }]),
    )
  return {
    schemaVersion: 1,
    asOf: '2026-11-21T00:00:00Z',
    reason: 'test',
    teams: Object.fromEntries(
      Object.entries(values).map(([id, rating], i) => [
        id,
        { rating, rd: 60, maps: offsets(i), sources: [source] },
      ]),
    ),
  }
}

const model = buildMatchModel(ratingsFor({ a: 1560, b: 1500 }), [], params, pool, '2026-11-21')
const advantage = (side: 'A' | 'B', map: string) =>
  side === 'A'
    ? model.strength('a', map) - model.strength('b', map)
    : model.strength('b', map) - model.strength('a', map)

describe('vetoOutcomes', () => {
  it('covers every veto, with probabilities that add up to 1', () => {
    for (const procedure of [bo1, bo3]) {
      const outcomes = vetoOutcomes(procedure.steps, pool, advantage, 25)
      expect(outcomes.reduce((sum, o) => sum + o.p, 0)).toBeCloseTo(1, 12)
      expect(outcomes.every((o) => o.maps.length === (procedure === bo1 ? 1 : 3))).toBe(true)
    }
  })

  it('is the greedy veto alone at temperature 0', () => {
    const outcomes = vetoOutcomes(bo3.steps, pool, advantage, 0)
    expect(outcomes).toEqual([{ maps: runVeto(bo3.steps, pool, advantage, 0), p: 1 }])
  })
})

describe('seriesWinChance', () => {
  it('matches the Monte Carlo series it replaces', () => {
    for (const format of ['bo1', 'bo3'] as const) {
      const exact = seriesWinChance('a', 'b', format, model, veto)
      const play = seriesPlayer(model, veto, createRng(3))
      const runs = 40000
      let wins = 0
      for (let i = 0; i < runs; i++) if (play('a', 'b', format) === 'a') wins++
      const se = Math.sqrt((exact * (1 - exact)) / runs)
      expect(Math.abs(wins / runs - exact)).toBeLessThan(4 * se)
      expect(exact).toBeGreaterThan(0.5)
    }
  })
})

describe('simulateSwiss with exact match odds', () => {
  const seeds = Array.from({ length: 16 }, (_, i) => `t${i + 1}`)
  const rules: SwissRules = {
    winsToAdvance: 3,
    lossesToEliminate: 3,
    initialPairing: Array.from({ length: 8 }, (_, i) => [i + 1, i + 9] as [number, number]),
  }
  const stageModel = buildMatchModel(
    ratingsFor(Object.fromEntries(seeds.map((id, i) => [id, 1650 - i * 20]))),
    [],
    params,
    pool,
    '2026-11-21',
  )
  const base = {
    seeds,
    rules,
    format: { default: 'bo1', decider: 'bo3' } as const,
    veto,
    model: stageModel,
    played: [],
    runs: 500,
    seed: 7,
  }

  it('gives the exact series chance for every upcoming match', () => {
    const result = simulateSwiss(base)
    for (const m of result.upcoming) {
      expect(m.pA).toBe(seriesWinChance(m.teamA, m.teamB, m.format, stageModel, veto))
    }
  })

  it('gives the same odds in round 2 with matches played and the rest announced flipped', () => {
    const round1 = pairRound(1, seeds, [], rules).map((p) => ({ ...p, round: 1, winner: p.teamA }))
    const round2 = pairRound(2, seeds, round1, rules)
    const first = round2[0]
    if (!first) throw new Error('no round 2 pairing')
    const played = [...round1, { ...first, round: 2, winner: first.teamB }]
    const plain = simulateSwiss({ ...base, played })
    const announced = round2
      .slice(1)
      .reverse()
      .map((p) => ({ teamA: p.teamB, teamB: p.teamA }))
    expect(simulateSwiss({ ...base, played, announced })).toEqual(plain)
    expect(plain.upcoming).toHaveLength(7)
  })

  it('gives the same odds when the round is announced in another order', () => {
    const plain = simulateSwiss(base)
    const announced = [...pairRound(1, seeds, [], rules)].reverse()
    expect(simulateSwiss({ ...base, announced })).toEqual(plain)
  })
})

describe('veto habits (params.veto.habits)', () => {
  const stats = (teamId: string, maps: Record<string, { pick: number; ban: number }>, n = 40) => ({
    schemaVersion: 1 as const,
    teamId,
    window: { from: '2026-08-21', to: '2026-11-21' },
    filter: 'vs HLTV top 50',
    mapsPlayed: n,
    maps,
    source,
  })
  const shares = {
    a: stats('a', {
      ancient: { pick: 80, ban: 0 },
      cache: { pick: 0, ban: 60 },
      dust2: { pick: 10, ban: 30 },
      inferno: { pick: 10, ban: 10 },
      mirage: { pick: 0, ban: 0 },
      nuke: { pick: 0, ban: 0 },
    }),
    b: stats('b', { mirage: { pick: 90, ban: 0 }, nuke: { pick: 10, ban: 50 } }, 5),
  }
  const window = { from: '2026-08-21', to: '2026-11-21' }
  const habits = {
    ...params,
    veto: { temperature: 25, habits: { weight: 1, shrinkMaps: 5, window } },
  }
  const ratings = ratingsFor({ a: 1560, b: 1500 })
  const withHabits = buildMatchModel(ratings, [], habits, pool, '2026-11-21', shares)

  it('changes nothing without the setting, with or without veto data', () => {
    const plain = buildMatchModel(ratings, [], params, pool, '2026-11-21', shares)
    expect(plain.vetoHabit('a', 'ban', pool)).toBeUndefined()
    for (const format of ['bo1', 'bo3'] as const) {
      expect(seriesWinChance('a', 'b', format, plain, veto)).toBe(
        seriesWinChance('a', 'b', format, model, veto),
      )
    }
  })

  it('reads HLTV shares plus a 1-point floor; a map never played in 15+ maps is a full ban', () => {
    const ban = withHabits.vetoHabit('a', 'ban', ['anubis', 'cache', 'mirage'])
    expect(ban?.shares).toEqual([101, 61, 1])
    expect(withHabits.vetoHabit('a', 'pick', ['anubis', 'ancient'])?.shares).toEqual([1, 81])
    // Team b has 5 maps: a map it never played gets its average ban share (25), not a full ban.
    expect(withHabits.vetoHabit('b', 'ban', ['anubis', 'nuke'])?.shares).toEqual([26, 51])
    // weight × n / (n + shrinkMaps): 40 maps count far more than 5.
    expect(ban?.weight).toBeCloseTo(40 / 45, 12)
    expect(withHabits.vetoHabit('b', 'ban', pool)?.weight).toBeCloseTo(0.5, 12)
    expect(withHabits.vetoHabit('nobody', 'ban', pool)).toBeUndefined()
  })

  it('refuses veto stats from another window, or none at all', () => {
    const other = {
      ...shares,
      a: { ...shares.a, window: { from: '2026-09-01', to: '2026-11-21' } },
    }
    expect(() => buildMatchModel(ratings, [], habits, pool, '2026-11-21', other)).toThrow(/window/)
    expect(() => buildMatchModel(ratings, [], habits, pool, '2026-11-21', {})).toThrow(
      /no veto stats/,
    )
  })

  it('runs the old veto exactly when a habit gives nothing', () => {
    const none = () => undefined
    for (const seed of [1, 2, 3]) {
      expect(runVeto(bo3.steps, pool, advantage, 25, createRng(seed), none)).toEqual(
        runVeto(bo3.steps, pool, advantage, 25, createRng(seed)),
      )
    }
    expect(vetoOutcomes(bo1.steps, pool, advantage, 25, none)).toEqual(
      vetoOutcomes(bo1.steps, pool, advantage, 25),
    )
  })

  it('keeps exact veto probabilities adding up to 1, and the series odds match the Monte Carlo', () => {
    const habit = (side: 'A' | 'B', action: 'ban' | 'pick', remaining: readonly string[]) =>
      withHabits.vetoHabit(side === 'A' ? 'a' : 'b', action, remaining)
    for (const procedure of [bo1, bo3]) {
      const outcomes = vetoOutcomes(procedure.steps, pool, advantage, 25, habit)
      expect(outcomes.reduce((sum, o) => sum + o.p, 0)).toBeCloseTo(1, 12)
    }
    const exact = seriesWinChance('a', 'b', 'bo3', withHabits, veto)
    const play = seriesPlayer(withHabits, veto, createRng(5))
    const runs = 40000
    let wins = 0
    for (let i = 0; i < runs; i++) if (play('a', 'b', 'bo3') === 'a') wins++
    expect(Math.abs(wins / runs - exact)).toBeLessThan(0.01)
  })

  it('bans what teams usually ban, so the decider is a map both rarely ban', () => {
    const habit = (side: 'A' | 'B', action: 'ban' | 'pick', remaining: readonly string[]) =>
      withHabits.vetoHabit(side === 'A' ? 'a' : 'b', action, remaining)
    const decider = (map: string, withHabit: boolean) =>
      vetoOutcomes(bo1.steps, pool, advantage, 25, withHabit ? habit : undefined)
        .filter((o) => o.maps[0] === map)
        .reduce((sum, o) => sum + o.p, 0)
    // Neither team bans Mirage; team a never played Anubis and bans Cache most.
    expect(decider('mirage', true)).toBeGreaterThan(decider('mirage', false))
    expect(decider('anubis', true)).toBeLessThan(decider('mirage', true))
    expect(decider('cache', true)).toBeLessThan(decider('mirage', true))
  })
})
