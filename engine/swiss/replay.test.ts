/**
 * Replays real Major Swiss stages: for every round 2-5, the pairings the engine computes from the
 * earlier real results must equal the real pairings. Fixtures come from Liquipedia (CC-BY-SA 3.0),
 * built by scripts/build-swiss-fixtures.ts.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { swissMatchFormat } from './format.ts'
import { pairRound } from './pairing.ts'
import { buildRecords } from './records.ts'
import type { SwissMatch, SwissRules } from './types.ts'

interface Fixture {
  source: { name: string }
  seeds: string[]
  matches: Array<SwissMatch & { format: 'bo1' | 'bo3' | 'bo5' }>
}

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

const fixtureDir = join(import.meta.dirname, 'fixtures')
const fixtures = readdirSync(fixtureDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({
    name: file.replace('.json', ''),
    data: JSON.parse(readFileSync(join(fixtureDir, file), 'utf8')) as Fixture,
  }))

const pairKey = (a: string, b: string) => [a, b].sort().join(' v ')

describe.each(fixtures)('replay $name', ({ data }) => {
  it.each([1, 2, 3, 4, 5])('round %i pairings match the real bracket', (round) => {
    const real = data.matches
      .filter((m) => m.round === round)
      .map((m) => pairKey(m.teamA, m.teamB))
      .sort()
    const computed = pairRound(round, data.seeds, data.matches, rules)
      .map((p) => pairKey(p.teamA, p.teamB))
      .sort()
    expect(computed).toEqual(real)
  })

  it('every elimination/advancement match is Bo3, and other matches share one format', () => {
    const nonDeciderFormats = new Set<string>()
    for (const match of data.matches) {
      const records = buildRecords(
        data.seeds,
        data.matches.filter((m) => m.round < match.round),
      )
      const a = records.get(match.teamA)
      const b = records.get(match.teamB)
      if (!a || !b) throw new Error(`unknown team in ${match.teamA} v ${match.teamB}`)
      const kind = swissMatchFormat(a, b, rules, { default: 'bo1', decider: 'bo3' })
      if (kind === 'bo3') expect(match.format, `${match.teamA} v ${match.teamB}`).toBe('bo3')
      else nonDeciderFormats.add(match.format)
    }
    expect(nonDeciderFormats.size).toBeLessThanOrEqual(1)
  })
})
