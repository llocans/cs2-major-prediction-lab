/**
 * Builds compact replay fixtures for engine tests from cached Liquipedia API responses.
 * Input: .cache/liquipedia/<title>.json (action=query&prop=revisions responses).
 * Output: engine/swiss/fixtures/<slug>.json with source attribution (CC-BY-SA 3.0).
 * Usage: node scripts/build-swiss-fixtures.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { repoPath } from './lib/files.ts'
import { matchWinner, parseSwissMatches, parseSwissSeeds } from './lib/wikitext.ts'

const stages: Array<{ title: string; slug: string }> = [
  { title: 'BLAST/Major/2025/Austin/Stage 1', slug: 'austin-2025-stage-1' },
  { title: 'BLAST/Major/2025/Austin/Stage 2', slug: 'austin-2025-stage-2' },
  { title: 'BLAST/Major/2025/Austin/Stage 3', slug: 'austin-2025-stage-3' },
  { title: 'Intel Extreme Masters/2026/Cologne/Stage 1', slug: 'cologne-2026-stage-1' },
  { title: 'Intel Extreme Masters/2026/Cologne/Stage 2', slug: 'cologne-2026-stage-2' },
  { title: 'Intel Extreme Masters/2026/Cologne/Stage 3', slug: 'cologne-2026-stage-3' },
]

/** Liquipedia pages sometimes use two template names for one team. Each group is one team. */
const ALIAS_GROUPS: string[][] = [
  ['flyquest', 'fq'],
  ['vitality', 'vit'],
  ['liquid', 'tl'],
]

function canonical(name: string, seeds: readonly string[]): string {
  if (seeds.includes(name)) return name
  const group = ALIAS_GROUPS.find((names) => names.includes(name))
  const resolved = group?.find((alias) => seeds.includes(alias))
  if (!resolved) throw new Error(`Team "${name}" is not in the seed list; add it to ALIAS_GROUPS`)
  return resolved
}

interface RevisionsResponse {
  query: {
    pages: Record<
      string,
      { revisions: Array<{ revid: number; timestamp: string; slots: { main: { '*': string } } }> }
    >
  }
}

for (const stage of stages) {
  const cacheFile = repoPath('.cache/liquipedia', `${stage.title.replaceAll(/[/ ]/g, '_')}.json`)
  const response = JSON.parse(readFileSync(cacheFile, 'utf8')) as RevisionsResponse
  const page = Object.values(response.query.pages)[0]
  const revision = page?.revisions[0]
  if (!revision) throw new Error(`${stage.title}: no revision in cache file`)
  const text = revision.slots.main['*']

  const seeds = parseSwissSeeds(text)
  const matches = parseSwissMatches(text).map((match) => {
    const winner = matchWinner(match)
    if (!match.finished || !winner) {
      throw new Error(`${stage.title}: unfinished match ${match.opponent1} vs ${match.opponent2}`)
    }
    const teamA = canonical(match.opponent1, seeds)
    const teamB = canonical(match.opponent2, seeds)
    return {
      round: match.round,
      teamA,
      teamB,
      winner: winner === 1 ? teamA : teamB,
      format: match.mapSlots === 1 ? 'bo1' : match.mapSlots === 3 ? 'bo3' : 'bo5',
    }
  })

  const fixture = {
    source: {
      name: `Liquipedia: ${stage.title} (rev ${revision.revid}, ${revision.timestamp})`,
      url: `https://liquipedia.net/counterstrike/${stage.title.replaceAll(' ', '_')}`,
      retrievedAt: '2026-11-21',
      license: 'CC-BY-SA 3.0',
    },
    seeds,
    matches,
  }
  writeFileSync(
    repoPath('engine/swiss/fixtures', `${stage.slug}.json`),
    `${JSON.stringify(fixture, null, 2)}\n`,
  )
  console.log(`${stage.slug}: ${seeds.length} seeds, ${matches.length} matches`)
}
