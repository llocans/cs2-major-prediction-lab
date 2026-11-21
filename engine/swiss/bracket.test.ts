import { describe, expect, it } from 'vitest'
import { type KnownMatch, swissBracket } from './bracket.ts'
import type { SwissRules } from './types.ts'

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
const seeds = Array.from({ length: 16 }, (_, i) => `t${i + 1}`)
const format = { default: 'bo1', decider: 'bo3' } as const

describe('swissBracket', () => {
  it('knows only round 1 before any result', () => {
    const bracket = swissBracket(seeds, [], rules, format)
    expect(bracket[0]?.known).toBe(true)
    expect(bracket[0]?.groups[0]?.matches).toHaveLength(8)
    expect(bracket[1]?.known).toBe(false)
  })

  it('reveals round 2 once round 1 is complete, mixing real and override results', () => {
    const round1: KnownMatch[] = rules.initialPairing.map(([a, b], i) => ({
      round: 1,
      teamA: `t${a}`,
      teamB: `t${b}`,
      winner: `t${a}`,
      kind: i < 4 ? 'real' : 'override',
    }))
    const bracket = swissBracket(seeds, round1, rules, format)
    expect(bracket[0]?.groups[0]?.matches.filter((m) => m.kind === 'override')).toHaveLength(4)
    expect(bracket[1]?.known).toBe(true)
    expect(bracket[1]?.groups.map((g) => g.record)).toEqual(['1-0', '0-1'])
    expect(bracket[1]?.groups[0]?.matches[0]).toMatchObject({
      teamA: 't1',
      teamB: 't8',
      kind: 'pending',
    })
    expect(bracket[2]?.known).toBe(false)
  })
})
