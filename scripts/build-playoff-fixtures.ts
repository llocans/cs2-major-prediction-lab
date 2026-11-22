/**
 * Builds replay fixtures of real Major playoff brackets for engine tests, from the Liquipedia API
 * (cached; see scripts/lib/liquipedia.ts). The playoff seeds come from the matching Stage 3 Swiss
 * fixture in engine/swiss/fixtures, so the test also checks the final mid-stage seed order.
 * Output: engine/playoffs/fixtures/<slug>.json with source attribution (CC-BY-SA 3.0).
 * Usage: node --env-file=.env scripts/build-playoff-fixtures.ts
 */
import { writeFileSync } from 'node:fs'
import { winsNeeded } from '../data/schemas/common.ts'
import { repoPath } from './lib/files.ts'
import { getPage } from './lib/liquipedia.ts'
import { matchWinner, parseBracketMatches } from './lib/wikitext.ts'

const events: Array<{ title: string; slug: string; stage3: string }> = [
  { title: 'BLAST/Major/2025/Austin/Playoffs', slug: 'austin-2025', stage3: 'austin-2025-stage-3' },
  {
    title: 'Intel Extreme Masters/2026/Cologne/Playoffs',
    slug: 'cologne-2026',
    stage3: 'cologne-2026-stage-3',
  },
]

/** Liquipedia pages sometimes use two template names for one team; the Swiss fixtures use the first. */
const ALIASES: Record<string, string> = { vitality: 'vit', liquid: 'tl', fq: 'flyquest' }

for (const event of events) {
  const page = await getPage(event.title)
  const matches = parseBracketMatches(page.text).map((match) => {
    const winner = matchWinner(match)
    if (!match.finished || !winner) {
      throw new Error(`${event.title}: unfinished match ${match.opponent1} vs ${match.opponent2}`)
    }
    const teamA = ALIASES[match.opponent1] ?? match.opponent1
    const teamB = ALIASES[match.opponent2] ?? match.opponent2
    // The format comes from the number of map slots; check it against the maps actually won.
    const format = match.mapSlots === 1 ? 'bo1' : match.mapSlots === 3 ? 'bo3' : 'bo5'
    const mapsWon = match.maps.filter((m) =>
      winner === 1 ? m.score1 > m.score2 : m.score2 > m.score1,
    ).length
    if (mapsWon !== winsNeeded[format]) {
      throw new Error(
        `${event.title}: ${teamA} vs ${teamB} has ${match.mapSlots} map slots (${format}) but the winner won ${mapsWon} maps`,
      )
    }
    return {
      round: match.round,
      index: match.index,
      thirdPlace: match.thirdPlace,
      teamA,
      teamB,
      winner: winner === 1 ? teamA : teamB,
      format,
    }
  })
  const fixture = {
    source: {
      name: `Liquipedia: ${page.title} (rev ${page.revid})`,
      url: `https://liquipedia.net/counterstrike/${page.title.replaceAll(' ', '_')}`,
      retrievedAt: new Date().toISOString().slice(0, 10),
      license: 'CC-BY-SA 3.0',
    },
    stage3Fixture: event.stage3,
    matches,
  }
  writeFileSync(
    repoPath('engine/playoffs/fixtures', `${event.slug}.json`),
    `${JSON.stringify(fixture, null, 2)}\n`,
  )
  console.log(`${event.slug}: ${matches.length} matches`)
}
