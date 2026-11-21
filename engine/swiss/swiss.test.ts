import { describe, expect, it } from 'vitest'
import { difficultyScore } from './difficulty.ts'
import { swissMatchFormat } from './format.ts'
import { pairRound } from './pairing.ts'
import { buildRecords } from './records.ts'
import { rankTeams } from './seeding.ts'
import type { SwissMatch, SwissRules } from './types.ts'

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
const won = (round: number, winner: string, loser: string): SwissMatch => ({
  round,
  teamA: winner,
  teamB: loser,
  winner,
})
const pairsOf = (pairings: Array<{ teamA: string; teamB: string }>) =>
  pairings.map((p) => `${p.teamA}-${p.teamB}`)

describe('difficultyScore', () => {
  it('matches the rulebook example: opponents at 2-0 and 1-1 give 2', () => {
    // Set the opponents' records directly, as in the rulebook example.
    const records = buildRecords(['A', 'B', 'X', 'Y'], [])
    const a = records.get('A')
    const x = records.get('X')
    const y = records.get('Y')
    if (!a || !x || !y) throw new Error('setup')
    a.opponents = ['X', 'Y']
    Object.assign(x, { wins: 2, losses: 0 })
    Object.assign(y, { wins: 1, losses: 1 })
    expect(difficultyScore(a, records)).toBe(2)
  })

  it('uses current records of opponents, not records at the time of the match', () => {
    // t1 beat t9 in round 1 (t9 was 0-0 then). t9 then won twice and is 2-1 now.
    const matches = [won(1, 't1', 't9'), won(2, 't9', 't16'), won(3, 't9', 't15')]
    const records = buildRecords(seeds, matches)
    const t1 = records.get('t1')
    if (!t1) throw new Error('setup')
    expect(difficultyScore(t1, records)).toBe(2 - 1)
  })
})

describe('rankTeams', () => {
  it('orders by record, then difficulty, then initial seed', () => {
    const matches = [
      won(1, 't1', 't9'),
      won(1, 't2', 't10'),
      won(1, 't11', 't3'),
      won(1, 't12', 't4'),
      won(2, 't9', 't3'), // t9 now 1-1, t3 0-2
      won(2, 't10', 't4'), // t10 now 1-1
    ]
    const records = buildRecords(seeds, matches)
    const oneZero = ['t1', 't2', 't11', 't12']
      .map((id) => records.get(id))
      .filter((r) => r !== undefined)
    // t1 beat t9 (1-1 → 0), t2 beat t10 (1-1 → 0), t11 beat t3 (0-2 → -2), t12 beat t4 (0-2 → -2)
    expect(rankTeams(oneZero, records).map((r) => r.teamId)).toEqual(['t1', 't2', 't11', 't12'])
  })
})

describe('pairRound', () => {
  it('round 1 pairs 1v9 .. 8v16', () => {
    expect(pairsOf(pairRound(1, seeds, [], rules))).toEqual([
      't1-t9',
      't2-t10',
      't3-t11',
      't4-t12',
      't5-t13',
      't6-t14',
      't7-t15',
      't8-t16',
    ])
  })

  it('round 2 pairs highest vs lowest seed within each record group', () => {
    const round1 = rules.initialPairing.map(([a, b]) => won(1, `t${a}`, `t${b}`))
    const pairs = pairsOf(pairRound(2, seeds, round1, rules))
    // 1-0 group: t1..t8 all faced different opponents; difficulty is equal (-1 each).
    expect(pairs.slice(0, 4)).toEqual(['t1-t8', 't2-t7', 't3-t6', 't4-t5'])
    expect(pairs.slice(4)).toEqual(['t9-t16', 't10-t15', 't11-t14', 't12-t13'])
  })

  it('skips the lowest seed when it would be a rematch', () => {
    // Round 3, 1-1 group where the natural opponent was already played.
    const matches = [
      won(1, 't1', 't9'),
      won(1, 't2', 't10'),
      won(1, 't3', 't11'),
      won(1, 't4', 't12'),
      won(1, 't5', 't13'),
      won(1, 't6', 't14'),
      won(1, 't7', 't15'),
      won(1, 't8', 't16'),
      won(2, 't1', 't8'),
      won(2, 't2', 't7'),
      won(2, 't3', 't6'),
      won(2, 't4', 't5'),
      won(2, 't9', 't16'),
      won(2, 't10', 't15'),
      won(2, 't11', 't14'),
      won(2, 't12', 't13'),
    ]
    const pairs = pairRound(3, seeds, matches, rules)
    for (const { teamA, teamB } of pairs) {
      const played = matches.some(
        (m) => (m.teamA === teamA && m.teamB === teamB) || (m.teamA === teamB && m.teamB === teamA),
      )
      expect(played, `${teamA}-${teamB} is a rematch`).toBe(false)
    }
    expect(pairs).toHaveLength(8)
  })

  it('uses only matches from earlier rounds', () => {
    const round1 = rules.initialPairing.map(([a, b]) => won(1, `t${a}`, `t${b}`))
    const withFuture = [...round1, won(2, 't1', 't8')]
    expect(pairRound(2, seeds, withFuture, rules)).toEqual(pairRound(2, seeds, round1, rules))
  })
})

describe('swissMatchFormat', () => {
  const format = { default: 'bo1', decider: 'bo3' } as const
  const record = (wins: number, losses: number) => ({
    teamId: 'x',
    seed: 1,
    wins,
    losses,
    opponents: [],
  })

  it.each([
    [0, 0, 'bo1'],
    [1, 0, 'bo1'],
    [1, 1, 'bo1'],
    [2, 0, 'bo3'],
    [0, 2, 'bo3'],
    [2, 1, 'bo3'],
    [1, 2, 'bo3'],
    [2, 2, 'bo3'],
  ])('record %i-%i plays %s', (wins, losses, expected) => {
    expect(swissMatchFormat(record(wins, losses), record(wins, losses), rules, format)).toBe(
      expected,
    )
  })
})
