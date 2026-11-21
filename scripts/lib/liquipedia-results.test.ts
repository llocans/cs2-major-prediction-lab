import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MatchResult } from '../../data/schemas/index.ts'
import { readStagePage } from './liquipedia-results.ts'

// Finished stage page cached by the fixture pull (gitignored). Skipped on a fresh clone.
const cached = join(
  import.meta.dirname,
  '../../.cache/liquipedia/Intel_Extreme_Masters_2026_Cologne_Stage_1.json',
)
const source = { name: 'test', retrievedAt: '2026-11-21' }
const mapIds: Record<string, string> = {
  Ancient: 'ancient',
  Anubis: 'anubis',
  Cache: 'cache',
  'Dust II': 'dust2',
  Inferno: 'inferno',
  Mirage: 'mirage',
  Nuke: 'nuke',
  Overpass: 'overpass',
  Train: 'train',
}

describe.skipIf(!existsSync(cached))('readStagePage (Cologne 2026 Stage 1)', () => {
  const response = JSON.parse(readFileSync(cached, 'utf8'))
  const text =
    Object.values(
      response.query.pages as Record<
        string,
        { revisions: Array<{ slots: { main: { '*': string } } }> }
      >,
    )[0]?.revisions[0]?.slots.main['*'] ?? ''

  const page = readStagePage(text, {
    stageId: 'stage-1',
    resolveTeam: (name) => name.replaceAll(' ', '-'),
    resolveMap: (name) => {
      const id = mapIds[name]
      if (!id) throw new Error(`unknown map ${name}`)
      return id
    },
    source,
  })

  it('reads all 33 finished matches as valid results', () => {
    expect(page.results).toHaveLength(33)
    for (const result of page.results) expect(() => MatchResult.parse(result)).not.toThrow()
    expect(page.announced.size).toBe(0)
  })

  it('derives formats and winners from the maps', () => {
    const bo3 = page.results.filter((r) => r.format === 'bo3')
    expect(bo3.length).toBeGreaterThan(10)
    for (const result of page.results) {
      const winsA = result.maps.filter((m) => m.scoreA > m.scoreB).length
      const winsB = result.maps.length - winsA
      expect(result.winner).toBe(winsA > winsB ? result.teamA : result.teamB)
    }
  })
})

describe('readStagePage (upcoming matches)', () => {
  it('returns announced pairings for matches without a result', () => {
    const text = `{{Matchlist|id=x|matchsection=Round 2
|{{Match|opponent1={{TeamOpponent|a}}|opponent2={{TeamOpponent|b}}|finished=
  |map1={{Map|map=|finished=}}}}
|{{Match|opponent1={{TeamOpponent|}}|opponent2={{TeamOpponent|}}|finished=}}
}}`
    const page = readStagePage(text, {
      stageId: 'stage-1',
      resolveTeam: (name) => name,
      resolveMap: (name) => name,
      source,
    })
    expect(page.results).toHaveLength(0)
    expect(page.announced.get(2)).toEqual([{ teamA: 'a', teamB: 'b' }])
  })
})
