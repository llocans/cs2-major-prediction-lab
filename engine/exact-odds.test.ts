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
