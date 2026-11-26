import { describe, expect, it } from 'vitest'
import { fullDraw } from './simulate-swiss.ts'
import { pairRound } from './swiss/pairing.ts'
import type { SwissMatch, SwissRules } from './swiss/types.ts'

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
const round1: SwissMatch[] = pairRound(1, seeds, [], rules).map((p) => ({
  round: 1,
  ...p,
  winner: p.teamA,
}))
const round2 = pairRound(2, seeds, round1, rules)

describe('fullDraw', () => {
  it('is undefined when nothing is announced', () => {
    expect(fullDraw(seeds, round1, rules, 2, undefined)).toBeUndefined()
    expect(fullDraw(seeds, round1, rules, 2, [])).toBeUndefined()
  })

  it('is undefined for a partial draw', () => {
    expect(fullDraw(seeds, round1, rules, 2, round2.slice(0, 5))).toBeUndefined()
  })

  it('accepts a full draw in any order', () => {
    const draw = fullDraw(seeds, round1, rules, 2, [...round2].reverse())
    expect(draw).toHaveLength(8)
  })

  it("adds the round's played matches to the announced rest (a live page)", () => {
    const [first, ...rest] = round2
    if (!first) throw new Error('no pairs')
    const played = [...round1, { round: 2, ...first, winner: first.teamA }]
    expect(fullDraw(seeds, played, rules, 2, rest)).toHaveLength(8)
  })

  it('rejects a team listed twice or a team not active', () => {
    const [a, b, ...rest] = round2
    if (!a || !b) throw new Error('no pairs')
    expect(
      fullDraw(seeds, round1, rules, 2, [{ teamA: a.teamA, teamB: b.teamA }, b, ...rest]),
    ).toBeUndefined()
    expect(
      fullDraw(seeds, round1, rules, 2, [{ teamA: a.teamA, teamB: 'x' }, b, ...rest]),
    ).toBeUndefined()
  })
})
