import { describe, expect, it } from 'vitest'
import type { VetoProcedure } from '../data/schemas/event-config.ts'
import type { ModelParams, Ratings } from '../data/schemas/model.ts'
import { buildMatchModel } from './match-model.ts'
import { Outcome, outcomeCollector } from './pickem.ts'
import type { PlayoffRules } from './playoffs/bracket.ts'
import { type EventChain, simulateEvent } from './simulate-event.ts'
import { simulateSwiss } from './simulate-swiss.ts'
import { advancingTeams } from './swiss/standings.ts'
import type { SwissMatch, SwissRules } from './swiss/types.ts'

const source = { name: 'test', retrievedAt: '2026-11-22' }
const step = (team: 'A' | 'B', action: 'ban' | 'pick', count = 1) => ({ team, action, count })
const bo1: VetoProcedure = {
  steps: [step('A', 'ban', 2), step('B', 'ban', 3), step('A', 'ban')],
  source,
}
const bo3: VetoProcedure = {
  steps: [
    step('A', 'ban'),
    step('B', 'ban'),
    step('A', 'pick'),
    step('B', 'pick'),
    step('B', 'ban'),
    step('A', 'ban'),
  ],
  source,
}
const bo5: VetoProcedure = {
  steps: [
    step('A', 'ban'),
    step('B', 'ban'),
    step('A', 'pick'),
    step('B', 'pick'),
    step('A', 'pick'),
    step('B', 'pick'),
  ],
  source,
  unverified: true,
}
const pool = ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke']
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

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const stage1 = ids('a', 16)
const invited2 = ids('b', 8)
const invited3 = ids('c', 8)
// Stage 3 invites strongest, Stage 1 weakest; within a group, seed 1 is strongest.
const strength: Record<string, number> = Object.fromEntries([
  ...invited3.map((id, i) => [id, 1700 - i * 15]),
  ...invited2.map((id, i) => [id, 1600 - i * 15]),
  ...stage1.map((id, i) => [id, 1550 - i * 15]),
])
const ratings: Ratings = {
  schemaVersion: 1,
  asOf: '2026-11-22T00:00:00Z',
  reason: 'test',
  teams: Object.fromEntries(
    Object.entries(strength).map(([id, rating]) => [
      id,
      { rating, rd: 60, maps: {}, sources: [source] },
    ]),
  ),
}
const model = buildMatchModel(ratings, [], params, pool, '2026-11-22')
const swissRules: SwissRules = {
  winsToAdvance: 3,
  lossesToEliminate: 3,
  initialPairing: Array.from({ length: 8 }, (_, i) => [i + 1, i + 9] as [number, number]),
}
const playoffRules: PlayoffRules = {
  bracket: [
    [1, 8],
    [4, 5],
    [2, 7],
    [3, 6],
  ],
  format: { default: 'bo3', final: 'bo5', thirdPlace: 'bo3' },
  thirdPlaceDecider: true,
}
const swissFormat = { default: 'bo1', decider: 'bo3' } as const
const chain: EventChain = {
  next: [
    { id: 'stage-2', rules: swissRules, format: swissFormat, invited: invited2 },
    {
      id: 'stage-3',
      rules: swissRules,
      format: { default: 'bo3', decider: 'bo3' },
      invited: invited3,
    },
  ],
  playoffs: { rules: playoffRules },
}
const input = {
  seeds: stage1,
  rules: swissRules,
  format: swissFormat,
  veto: { bo1, bo3, bo5 },
  model,
  played: [],
  runs: 1500,
  seed: 3,
}
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

describe('simulateEvent', () => {
  const result = simulateEvent(input, chain)
  const odds = (id: string) => result.teams.find((t) => t.teamId === id)

  it('reports the current stage exactly as simulateSwiss does', () => {
    expect(result.stage).toEqual(simulateSwiss(input))
  })

  it('covers every team, with 8 playoff spots and one champion per run', () => {
    expect(result.teams).toHaveLength(32)
    expect(sum(result.teams.map((t) => t.pPlayoffs))).toBeCloseTo(8, 10)
    expect(sum(result.teams.map((t) => t.pTitle ?? 0))).toBeCloseTo(1, 10)
    for (const team of result.teams) expect(team.pTitle ?? 0).toBeLessThanOrEqual(team.pPlayoffs)
  })

  it('only lets a Stage 1 team reach the playoffs by advancing from Stage 1', () => {
    const stage = result.stage.teams.find((t) => t.teamId === 'a1')
    expect(odds('a1')?.pPlayoffs ?? 1).toBeLessThanOrEqual(stage?.pAdvance ?? 0)
  })

  it('favours stronger, later-invited teams', () => {
    expect(odds('c1')?.pTitle ?? 0).toBeGreaterThan(odds('b1')?.pTitle ?? 0)
    expect(odds('b1')?.pTitle ?? 0).toBeGreaterThan(odds('a16')?.pTitle ?? 1)
  })

  it('seeds each stage with its invited teams, then the advancing teams in final seed order', () => {
    const seen: Array<{ stageId: string; seeds: readonly string[] }> = []
    const stage1Runs: Array<readonly SwissMatch[]> = []
    simulateSwiss({ ...input, runs: 1 }, (matches) => stage1Runs.push(matches))
    simulateEvent({ ...input, runs: 1 }, chain, {
      observe: (stageId, seeds) => seen.push({ stageId, seeds }),
    })
    const [stage2, stage3, playoffs] = seen
    expect(seen.map((s) => s.stageId)).toEqual(['stage-2', 'stage-3', 'playoffs'])
    const fromStage1 = advancingTeams(stage1, stage1Runs[0] ?? [], swissRules)
    expect(stage2?.seeds).toEqual([...invited2, ...fromStage1])
    expect(stage3?.seeds.slice(0, 8)).toEqual(invited3)
    expect(stage3?.seeds).toHaveLength(16)
    expect(playoffs?.seeds).toHaveLength(8)
    expect(new Set(playoffs?.seeds).size).toBe(8)
    for (const team of playoffs?.seeds ?? []) expect(stage3?.seeds).toContain(team)
  })

  it('is deterministic for a seed', () => {
    expect(simulateEvent(input, chain)).toEqual(result)
  })

  it('names the unverified veto procedures it used', () => {
    expect(result.unverifiedVeto).toEqual(['bo5'])
  })

  it('reports playoff odds without title odds when the chain has no playoffs', () => {
    const noPlayoffs = simulateEvent({ ...input, runs: 300 }, { next: chain.next })
    expect(noPlayoffs.teams.every((t) => t.pTitle === undefined)).toBe(true)
    expect(sum(noPlayoffs.teams.map((t) => t.pPlayoffs))).toBeCloseTo(8, 10)
    expect(noPlayoffs.unverifiedVeto).toEqual([])
  })

  it('rejects a team listed in two stages', () => {
    const twice: EventChain = {
      next: [
        {
          id: 'stage-2',
          rules: swissRules,
          format: swissFormat,
          invited: [...invited2.slice(1), 'a1'],
        },
      ],
    }
    expect(() => simulateEvent({ ...input, runs: 10 }, twice)).toThrow(/more than one stage/)
  })
})

describe("Pick'Em outcomes from the simulation", () => {
  it('see every run of the current stage, real results included, without changing the odds', () => {
    // Round 1 seed pairing is 1 v 9 (a1 v a9); a9 wins it for real.
    const played = [{ round: 1, teamA: 'a1', teamB: 'a9', winner: 'a9' }]
    const withResult = { ...input, played, runs: 400 }
    const collect = outcomeCollector(stage1, swissRules, 400)
    const event = simulateEvent(withResult, chain, { onStageRun: collect.add })
    expect(event).toEqual(simulateEvent(withResult, chain))
    const outcomes = collect.result()
    expect(outcomes.runs).toBe(400)
    const a1 = stage1.indexOf('a1')
    const a9 = stage1.indexOf('a9')
    for (let run = 0; run < outcomes.runs; run++) {
      expect(outcomes.codes[run * stage1.length + a1]).not.toBe(Outcome.ThreeZero)
      expect(outcomes.codes[run * stage1.length + a9]).not.toBe(Outcome.ZeroThree)
    }
    // 3-0 teams per run: exactly two in a 16-team Swiss stage.
    for (let run = 0; run < outcomes.runs; run++) {
      const row = outcomes.codes.subarray(run * stage1.length, (run + 1) * stage1.length)
      expect(row.filter((c) => c === Outcome.ThreeZero)).toHaveLength(2)
    }
  })
})
