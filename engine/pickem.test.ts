import { describe, expect, it } from 'vitest'
import {
  cleanSwissPicks,
  emptySwissPicks,
  modelPlayoffPicks,
  modelSwissPicks,
  Outcome,
  outcomeCollector,
  prunePlayoffPicks,
  type SwissPickOdds,
  scorePlayoffPicks,
  scoreSwissPicks,
  slotCandidates,
  swissPickChance,
  swissPickStatus,
  tally,
} from './pickem.ts'
import { type PlayoffRules, resolveBracket } from './playoffs/bracket.ts'
import type { SwissRules } from './swiss/types.ts'

const rules: SwissRules = { winsToAdvance: 3, lossesToEliminate: 3, initialPairing: [] }
const rec = (wins: number, losses: number) => ({ wins, losses })

describe('Swiss pick status', () => {
  it('settles a pick as soon as the record decides it', () => {
    expect(swissPickStatus('threeZero', rec(2, 0), rules)).toBe('pending')
    expect(swissPickStatus('threeZero', rec(3, 0), rules)).toBe('correct')
    expect(swissPickStatus('threeZero', rec(1, 1), rules)).toBe('wrong')
    expect(swissPickStatus('zeroThree', rec(0, 2), rules)).toBe('pending')
    expect(swissPickStatus('zeroThree', rec(0, 3), rules)).toBe('correct')
    expect(swissPickStatus('zeroThree', rec(1, 0), rules)).toBe('wrong')
  })

  it('counts an advance pick only for 3-1 and 3-2, not 3-0', () => {
    expect(swissPickStatus('advance', rec(2, 0), rules)).toBe('pending')
    expect(swissPickStatus('advance', rec(3, 0), rules)).toBe('wrong')
    expect(swissPickStatus('advance', rec(3, 1), rules)).toBe('correct')
    expect(swissPickStatus('advance', rec(3, 2), rules)).toBe('correct')
    expect(swissPickStatus('advance', rec(2, 3), rules)).toBe('wrong')
  })

  it('scores and tallies a set of picks', () => {
    const picks = { threeZero: ['a'], advance: ['b', 'c'], zeroThree: ['d'] }
    const records = new Map([
      ['a', rec(1, 1)],
      ['b', rec(3, 1)],
      ['d', rec(0, 3)],
    ])
    const statuses = scoreSwissPicks(picks, records, rules)
    expect(Object.fromEntries(statuses)).toEqual({
      a: 'wrong',
      b: 'correct',
      c: 'pending',
      d: 'correct',
    })
    expect(tally(statuses.values())).toEqual({ correct: 2, wrong: 1, pending: 1 })
  })
})

describe('stored picks', () => {
  it("keep only this stage's teams, each once, within the box sizes", () => {
    const stored = { threeZero: ['a', 'x', 'b', 'c'], advance: ['a', 'd'], zeroThree: ['e'] }
    const format = { threeZero: 2, advance: 6, zeroThree: 2, toPass: 5 }
    expect(cleanSwissPicks(stored, ['a', 'b', 'c', 'd', 'e'], format)).toEqual({
      threeZero: ['a', 'b'],
      advance: ['d'],
      zeroThree: ['e'],
    })
  })
})

describe('Swiss pick chance', () => {
  it('collects outcomes per run and counts passing runs', () => {
    const seeds = ['a', 'b']
    const collect = outcomeCollector(seeds, rules, 2)
    // Run 1: a goes 3-0, b 0-3. Run 2: a 3-1, b 1-3.
    const m = (round: number, winner: string) => ({ round, teamA: 'a', teamB: 'b', winner })
    collect.add([m(1, 'a'), m(2, 'a'), m(3, 'a')])
    collect.add([m(1, 'a'), m(2, 'b'), m(3, 'a'), m(4, 'a')])
    const outcomes = collect.result()
    expect([...outcomes.codes]).toEqual([
      Outcome.ThreeZero,
      Outcome.ZeroThree,
      Outcome.Advance,
      Outcome.Out,
    ])
    const picks = { ...emptySwissPicks(), threeZero: ['a'], zeroThree: ['b'] }
    expect(swissPickChance(picks, outcomes, 2)).toEqual({ pPass: 0.5, expected: 1 })
    expect(swissPickChance(picks, outcomes, 1)).toEqual({ pPass: 0.5, expected: 1 })
    const advance = { ...emptySwissPicks(), advance: ['a'] }
    expect(swissPickChance(advance, outcomes, 1)).toEqual({ pPass: 0.5, expected: 0.5 })
  })
})

describe("the model's Swiss picks", () => {
  const odds = (teamId: string, p30: number, pAdvance: number, p03: number): SwissPickOdds => ({
    teamId,
    p30,
    pAdvance,
    p03,
  })

  it('fills every box with distinct teams', () => {
    const teams = Array.from({ length: 16 }, (_, i) =>
      odds(`t${i}`, (16 - i) / 40, (16 - i) / 17, i / 40),
    )
    const picks = modelSwissPicks(teams, { threeZero: 2, advance: 6, zeroThree: 2, toPass: 5 })
    expect(picks.threeZero).toHaveLength(2)
    expect(picks.advance).toHaveLength(6)
    expect(picks.zeroThree).toHaveLength(2)
    const all = [...picks.threeZero, ...picks.advance, ...picks.zeroThree]
    expect(new Set(all).size).toBe(10)
    expect(picks.zeroThree).toEqual(['t15', 't14'])
  })

  it('moves a team to the box where it adds more', () => {
    // x is the best 3-0 bet but a far better 3-1/3-2 bet; y is nearly as good a 3-0 bet.
    const teams = [odds('x', 0.3, 0.95, 0), odds('y', 0.29, 0.35, 0), odds('z', 0, 0.1, 0.5)]
    const picks = modelSwissPicks(teams, { threeZero: 1, advance: 1, zeroThree: 1, toPass: 2 })
    expect(picks).toEqual({ threeZero: ['y'], advance: ['x'], zeroThree: ['z'] })
  })
})

describe('playoff picks', () => {
  const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']
  const stage: PlayoffRules = {
    bracket: [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ],
    format: { default: 'bo3', final: 'bo5' },
    thirdPlaceDecider: false,
  }
  const results = new Map([
    ['s1|s8', 's8'],
    ['s4|s5', 's4'],
  ])
  const bracket = resolveBracket(seeds, stage, ({ teamA, teamB }) =>
    results.get(`${teamA}|${teamB}`),
  )
  const firstRound = bracket.filter((m) => m.round === 1)

  it('offers the earlier picks as later candidates and prunes broken chains', () => {
    expect(slotCandidates(1, 0, firstRound, {})).toEqual(['s1', 's8'])
    const picks = { '1-0': 's1', '1-1': 's4', '2-0': 's1', '3-0': 's1' }
    expect(slotCandidates(2, 0, firstRound, picks)).toEqual(['s1', 's4'])
    expect(slotCandidates(3, 0, firstRound, picks)).toEqual(['s1'])
    const changed = prunePlayoffPicks({ ...picks, '1-0': 's8' }, firstRound, 3)
    expect(changed).toEqual({ '1-0': 's8', '1-1': 's4' })
  })

  it('marks a pick wrong as soon as its team is out', () => {
    const picks = { '1-0': 's1', '1-1': 's4', '1-2': 's2', '2-0': 's1', '3-0': 's1' }
    expect(Object.fromEntries(scorePlayoffPicks(picks, bracket))).toEqual({
      '1-0': 'wrong',
      '1-1': 'correct',
      '1-2': 'pending',
      '2-0': 'wrong',
      '3-0': 'wrong',
    })
  })

  it("picks the model's likelier winner in every match, building on its picks", () => {
    const odds = seeds.map((teamId, i) => ({
      teamId,
      pSemifinal: 1 - i / 10,
      pFinal: 0.5 - i / 20,
      pTitle: 0.3 - i / 30,
    }))
    const fresh = resolveBracket(seeds, stage, () => undefined).filter((m) => m.round === 1)
    expect(modelPlayoffPicks(fresh, 3, odds)).toEqual({
      '1-0': 's1',
      '1-1': 's4',
      '1-2': 's2',
      '1-3': 's3',
      '2-0': 's1',
      '2-1': 's2',
      '3-0': 's1',
    })
  })
})
