import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MapId, MatchFormat } from '../../data/schemas/common.ts'
import { EventConfig, type VetoProcedure } from '../../data/schemas/event-config.ts'
import type { MatchModel } from '../match-model.ts'
import type { VetoRules } from '../series.ts'
import { advancingTeams } from '../swiss/standings.ts'
import type { SwissMatch } from '../swiss/types.ts'
import { type PlayoffResult, type PlayoffRules, resolveBracket } from './bracket.ts'
import { realBracket, simulatePlayoffs } from './simulate-playoffs.ts'

const rules: PlayoffRules = {
  bracket: [
    [1, 8],
    [4, 5],
    [2, 7],
    [3, 6],
  ],
  format: { default: 'bo3', final: 'bo5', thirdPlace: 'bo3' },
  thirdPlaceDecider: true,
}
const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']
const pool: MapId[] = ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke']
const source = { name: 'test', retrievedAt: '2026-11-22' }
const step = (team: 'A' | 'B', action: 'ban' | 'pick') => ({ team, action, count: 1 })
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
}
const veto: VetoRules = { bo3, bo5 }

/** A simple model: each team has one strength on every map; 400 points = 10:1 odds per map. */
function fakeModel(strength: Record<string, number>): MatchModel {
  const s = (team: string) => strength[team] ?? 1500
  return {
    mapPool: pool,
    mapWin: (a, b) => 1 / (1 + 10 ** ((s(b) - s(a)) / 400)),
    strength: (team) => s(team),
    rd: () => 60,
    mapSamples: () => 0,
    modifiersFor: () => [],
    vetoTemperature: 25,
  }
}
const equal = fakeModel({})
// s1 strongest, s8 weakest, 40 points apart.
const graded = fakeModel(Object.fromEntries(seeds.map((team, i) => [team, 1640 - i * 40])))

const pair = (a?: string, b?: string) => `${a} v ${b}`

describe('resolveBracket', () => {
  it('pairs 1v8, 4v5, 2v7, 3v6 with the higher seed as teamA, then follows winners', () => {
    const higherSeedWins = resolveBracket(seeds, rules, (m) => m.teamA)
    const byRound = (round: number, third = false) =>
      higherSeedWins
        .filter((m) => m.round === round && m.thirdPlace === third)
        .map((m) => pair(m.teamA, m.teamB))
    expect(byRound(1)).toEqual(['s1 v s8', 's4 v s5', 's2 v s7', 's3 v s6'])
    expect(byRound(2)).toEqual(['s1 v s4', 's2 v s3'])
    expect(byRound(3)).toEqual(['s1 v s2'])
    expect(byRound(3, true)).toEqual(['s3 v s4'])
  })

  it('uses the configured format per match', () => {
    const formats = resolveBracket(seeds, rules, (m) => m.teamA).map(
      (m) => `${m.round}${m.thirdPlace ? 'tp' : ''}:${m.format}`,
    )
    expect(formats).toEqual([
      '1:bo3',
      '1:bo3',
      '1:bo3',
      '1:bo3',
      '2:bo3',
      '2:bo3',
      '3:bo5',
      '3tp:bo3',
    ])
  })

  it('puts the lower seed second even when it reaches a match through the top slot', () => {
    // s8 beats s1 and meets s4 in the semifinal: s4 is the higher seed.
    const bracket = resolveBracket(seeds, rules, (m) => (m.teamA === 's1' ? 's8' : m.teamA))
    const semi = bracket.find((m) => m.round === 2 && m.index === 0)
    expect(pair(semi?.teamA, semi?.teamB)).toBe('s4 v s8')
  })

  it('leaves later matches open when an earlier one is undecided', () => {
    const bracket = resolveBracket(seeds, rules, (m) =>
      m.round === 1 && m.index === 0 ? undefined : m.teamA,
    )
    const semi = bracket.find((m) => m.round === 2 && m.index === 0)
    expect(semi?.teamA).toBeUndefined()
    expect(semi?.teamB).toBeUndefined()
    expect(bracket.find((m) => m.round === 2 && m.index === 1)?.winner).toBe('s2')
    expect(bracket.find((m) => m.round === 3 && !m.thirdPlace)?.teamA).toBeUndefined()
  })

  it('has no third-place match when the event has none', () => {
    const bracket = resolveBracket(seeds, { ...rules, thirdPlaceDecider: false }, (m) => m.teamA)
    expect(bracket.some((m) => m.thirdPlace)).toBe(false)
    expect(bracket).toHaveLength(7)
  })

  it('rejects malformed brackets', () => {
    expect(() => resolveBracket(seeds.slice(0, 6), rules, (m) => m.teamA)).toThrow(
      /8 slots but 6 seeds/,
    )
    const twice: PlayoffRules = {
      ...rules,
      bracket: [
        [1, 8],
        [4, 5],
        [2, 7],
        [3, 3],
      ],
    }
    expect(() => resolveBracket(seeds, twice, (m) => m.teamA)).toThrow(/once each/)
    const three: PlayoffRules = {
      ...rules,
      bracket: [
        [1, 6],
        [2, 5],
        [3, 4],
      ],
    }
    expect(() => resolveBracket(seeds.slice(0, 6), three, (m) => m.teamA)).toThrow(/power-of-two/)
  })
})

describe('realBracket', () => {
  it('rejects a real result that is not in the bracket', () => {
    expect(() => realBracket(seeds, rules, [{ teamA: 's1', teamB: 's2', winner: 's1' }])).toThrow(
      /playoff seeds are wrong/,
    )
  })
})

describe('simulatePlayoffs', () => {
  const base = { seeds, rules, veto, played: [] as PlayoffResult[], runs: 4000, seed: 7 }
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

  it('produces consistent totals', () => {
    const result = simulatePlayoffs({ ...base, model: graded })
    expect(sum(result.teams.map((t) => t.pTitle))).toBeCloseTo(1, 10)
    expect(sum(result.teams.map((t) => t.pFinal))).toBeCloseTo(2, 10)
    expect(sum(result.teams.map((t) => t.pSemifinal))).toBeCloseTo(4, 10)
    expect(sum(result.teams.map((t) => t.pThird ?? 0))).toBeCloseTo(1, 10)
    for (const team of result.teams) {
      expect(team.pTitle).toBeLessThanOrEqual(team.pFinal)
      expect(team.pFinal).toBeLessThanOrEqual(team.pSemifinal)
    }
  })

  it('favours stronger teams and is deterministic for a seed', () => {
    const a = simulatePlayoffs({ ...base, model: graded })
    const b = simulatePlayoffs({ ...base, model: graded })
    expect(a).toEqual(b)
    const title = (id: string) => a.teams.find((t) => t.teamId === id)?.pTitle ?? 0
    expect(title('s1')).toBeGreaterThan(title('s4'))
    expect(title('s4')).toBeGreaterThan(title('s8'))
  })

  it('gives equal teams equal title odds within sampling error', () => {
    const result = simulatePlayoffs({ ...base, model: equal, runs: 16000 })
    // Standard error at 16,000 runs is about 0.0026; 0.015 is roughly 6 standard errors.
    for (const team of result.teams) expect(Math.abs(team.pTitle - 0.125)).toBeLessThan(0.015)
  })

  it('uses real semifinal and third-place results', () => {
    const played: PlayoffResult[] = [
      ['s1', 's8', 's1'],
      ['s4', 's5', 's5'],
      ['s2', 's7', 's2'],
      ['s3', 's6', 's6'],
      ['s1', 's5', 's5'],
      ['s2', 's6', 's2'],
      ['s1', 's6', 's6'],
    ].map(([teamA = '', teamB = '', winner = '']) => ({ teamA, teamB, winner }))
    const result = simulatePlayoffs({ ...base, model: graded, played })
    const odds = (id: string) => result.teams.find((t) => t.teamId === id)
    expect(odds('s6')?.pThird).toBe(1)
    expect(odds('s1')?.pThird).toBe(0)
    expect(
      result.upcoming.map((m) => `${m.thirdPlace ? 'final' : m.round}:${pair(m.teamA, m.teamB)}`),
    ).toEqual(['3:s2 v s5'])
    expect((odds('s2')?.pTitle ?? 0) + (odds('s5')?.pTitle ?? 0)).toBeCloseTo(1, 10)
  })

  it('names a missing earlier result when results arrive out of order', () => {
    // A semifinal result, but one of its quarterfinals has no result yet.
    const played: PlayoffResult[] = [
      { teamA: 's1', teamB: 's8', winner: 's1' },
      { teamA: 's1', teamB: 's4', winner: 's1' },
    ]
    expect(() => simulatePlayoffs({ ...base, model: graded, played })).toThrow(
      /earlier match in their path has no result/,
    )
  })

  it('has no third-place odds without a decider', () => {
    const result = simulatePlayoffs({
      ...base,
      model: graded,
      rules: { ...rules, thirdPlaceDecider: false },
    })
    expect(result.teams.every((t) => t.pThird === undefined)).toBe(true)
  })

  it('handles a 4-team bracket with a third-place match', () => {
    const four: PlayoffRules = {
      ...rules,
      bracket: [
        [1, 4],
        [2, 3],
      ],
    }
    const result = simulatePlayoffs({
      ...base,
      seeds: seeds.slice(0, 4),
      rules: four,
      model: graded,
    })
    expect(result.upcoming.map((m) => pair(m.teamA, m.teamB))).toEqual(['s1 v s4', 's2 v s3'])
    expect(sum(result.teams.map((t) => t.pSemifinal))).toBeCloseTo(4, 10)
    expect(sum(result.teams.map((t) => t.pFinal))).toBeCloseTo(2, 10)
    expect(sum(result.teams.map((t) => t.pThird ?? 0))).toBeCloseTo(1, 10)
  })

  it('handles a 2-team bracket: just the final, no third place', () => {
    const two: PlayoffRules = { ...rules, bracket: [[1, 2]] }
    const result = simulatePlayoffs({
      ...base,
      seeds: seeds.slice(0, 2),
      rules: two,
      model: graded,
    })
    expect(result.upcoming).toHaveLength(1)
    expect(result.upcoming[0]?.format).toBe('bo5')
    expect(
      result.teams.every((t) => t.pSemifinal === 1 && t.pFinal === 1 && t.pThird === undefined),
    ).toBe(true)
    expect(sum(result.teams.map((t) => t.pTitle))).toBeCloseTo(1, 10)
  })

  it('rejects a run count below 1', () => {
    expect(() => simulatePlayoffs({ ...base, model: graded, runs: 0 })).toThrow(/runs >= 1/)
  })

  it('respects real results and lists the open matches', () => {
    const played: PlayoffResult[] = [
      { teamA: 's1', teamB: 's8', winner: 's8' },
      { teamA: 's4', teamB: 's5', winner: 's4' },
    ]
    const result = simulatePlayoffs({ ...base, model: graded, played })
    const odds = (id: string) => result.teams.find((t) => t.teamId === id)
    expect(odds('s1')?.pSemifinal).toBe(0)
    expect(odds('s1')?.pTitle).toBe(0)
    expect(odds('s8')?.pSemifinal).toBe(1)
    expect(result.upcoming.map((m) => `${m.round}:${pair(m.teamA, m.teamB)}`)).toEqual([
      '1:s2 v s7',
      '1:s3 v s6',
      '2:s4 v s8',
    ])
    const s2s7 = result.upcoming.find((m) => m.teamA === 's2')
    expect(s2s7?.pA).toBeGreaterThan(0.5)
  })

  it('reports a decided event', () => {
    // Higher seeds win every match except the final.
    const played: PlayoffResult[] = [
      ['s1', 's8', 's1'],
      ['s4', 's5', 's4'],
      ['s2', 's7', 's2'],
      ['s3', 's6', 's3'],
      ['s1', 's4', 's1'],
      ['s2', 's3', 's2'],
      ['s1', 's2', 's2'],
      ['s3', 's4', 's3'],
    ].map(([teamA = '', teamB = '', winner = '']) => ({ teamA, teamB, winner }))
    const result = simulatePlayoffs({ ...base, model: graded, played })
    expect(result.upcoming).toEqual([])
    expect(result.teams.find((t) => t.pTitle === 1)?.teamId).toBe('s2')
    expect(result.teams.find((t) => t.pThird === 1)?.teamId).toBe('s3')
    expect(result.maxStandardError).toBe(0)
  })

  it('refuses a Bo5 final without a Bo5 veto in config', () => {
    expect(() => simulatePlayoffs({ ...base, model: graded, veto: { bo3 } })).toThrow(
      /No veto procedure for bo5/,
    )
  })
})

interface Fixture {
  source: { name: string }
  stage3Fixture: string
  matches: Array<
    PlayoffResult & { round: number; index: number; thirdPlace: boolean; format: MatchFormat }
  >
}

const config = EventConfig.parse(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '../../data/events/pgl-major-singapore-2026/config.json'),
      'utf8',
    ),
  ),
)
const singapore = config.stages.find((s) => s.type === 'single-elimination')
if (singapore?.type !== 'single-elimination')
  throw new Error('No playoff stage in the event config')

describe('event config playoffs', () => {
  it('runs on the engine with its own veto procedures', () => {
    const result = simulatePlayoffs({
      seeds,
      rules: singapore,
      veto: config.veto,
      model: graded,
      played: [],
      runs: 500,
      seed: 1,
    })
    expect(result.upcoming.map((m) => pair(m.teamA, m.teamB))).toEqual([
      's1 v s8',
      's4 v s5',
      's2 v s7',
      's3 v s6',
    ])
    expect(result.teams.every((t) => t.pThird !== undefined)).toBe(true)
  })
})

const majors = ['austin-2025', 'cologne-2026'].map((slug) => {
  const read = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T
  const fixture = read<Fixture>(join(import.meta.dirname, 'fixtures', `${slug}.json`))
  const stage3 = read<{ seeds: string[]; matches: SwissMatch[] }>(
    join(import.meta.dirname, '../swiss/fixtures', `${fixture.stage3Fixture}.json`),
  )
  return { slug, fixture, stage3 }
})

describe.each(majors)('replay $slug playoffs', ({ fixture, stage3 }) => {
  // Playoff seeds: the 8 advanced teams in final Stage 3 mid-stage seed order.
  // Checks advancingTeams (also used by the stage advance and the event chain) against real brackets.
  const playoffSeeds = advancingTeams(stage3.seeds, stage3.matches, {
    winsToAdvance: 3,
    lossesToEliminate: 3,
    initialPairing: [],
  })
  // The bracket under test is the one in our event config. Formats and the third-place match differ
  // between events, so they come from the fixture and are not asserted here.
  const majorRules: PlayoffRules = {
    bracket: singapore.bracket,
    format: { default: 'bo3', final: 'bo3' },
    thirdPlaceDecider: fixture.matches.some((m) => m.thirdPlace),
  }

  it('takes the 8 Stage 3 qualifiers as seeds', () => {
    expect(playoffSeeds).toHaveLength(8)
  })

  // Liquipedia may draw the two quarterfinals of a half in either order, so slots are matched by
  // pair and round. Which quarterfinals feed which semifinal is still checked: a semifinal pair that
  // the bracket cannot produce would not be found.
  it('reproduces every real match in the right round, with its winner', () => {
    const bracket = realBracket(playoffSeeds, majorRules, fixture.matches)
    const key = (a?: string, b?: string) => [a, b].sort().join(' v ')
    for (const real of fixture.matches) {
      const slot = bracket.find(
        (m) =>
          key(m.teamA, m.teamB) === key(real.teamA, real.teamB) && m.thirdPlace === real.thirdPlace,
      )
      expect(slot?.round).toBe(real.round)
      expect(slot?.winner).toBe(real.winner)
    }
    expect(bracket.every((m) => m.winner !== undefined)).toBe(true)
  })
})
