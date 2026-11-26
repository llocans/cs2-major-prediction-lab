/**
 * Imports pick and ban shares collected interactively from HLTV team map stats (the "Pick %" and
 * "Ban %" under each map) into data/teams/vetoes/<team-id>.json. Read the same page and window as
 * the map stats (`import-map-stats.ts`), so both describe the same games. Input: one team per line,
 *   <team-id> <hltv-team-path> <maps-played> <map>:<pick>/<ban> ...
 * e.g. "nip 4411/ninjas-in-pyjamas 58 nuke:46.2/4.8 dust2:0/33.3"
 * Usage: node scripts/research/import-veto-stats.ts <input.txt> <from YYYY-MM-DD> <to YYYY-MM-DD> <filter>
 * Refuses a team whose maps-played differs from its map stats file for the same window.
 */
import { existsSync, readFileSync } from 'node:fs'
import { TeamMapStats, TeamVetoStats } from '../../data/schemas/index.ts'
import { readJson, repoPath, writeJson } from '../lib/files.ts'

const [input, from, to, filter] = process.argv.slice(2)
if (!input || !from || !to || !filter) {
  console.error(
    'Usage: node scripts/research/import-veto-stats.ts <input.txt> <from> <to> <filter>',
  )
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
for (const line of readFileSync(input, 'utf8').split('\n')) {
  const [teamId, hltvPath, played, ...pairs] = line.trim().split(/\s+/)
  if (!teamId || !hltvPath || !played || pairs.length === 0) continue
  const mapsPlayed = Number(played)
  const mapStatsPath = repoPath('data/teams/maps', `${teamId}.json`)
  if (existsSync(mapStatsPath)) {
    const stats = readJson(mapStatsPath, TeamMapStats)
    const sameWindow = stats.window.from === from && stats.window.to === to
    if (sameWindow && stats.overall.played !== mapsPlayed) {
      throw new Error(
        `${teamId}: ${mapsPlayed} maps, but its map stats count ${stats.overall.played}`,
      )
    }
  }
  const maps: Record<string, { pick: number; ban: number }> = {}
  for (const pair of pairs) {
    const match = /^([a-z0-9]+):([\d.]+)\/([\d.]+)$/.exec(pair)
    if (!match?.[1] || !match[2] || !match[3]) throw new Error(`${teamId}: bad entry "${pair}"`)
    maps[match[1]] = { pick: Number(match[2]), ban: Number(match[3]) }
  }
  writeJson(repoPath('data/teams/vetoes', `${teamId}.json`), TeamVetoStats, {
    schemaVersion: 1,
    teamId,
    window: { from, to },
    filter: `vs HLTV ${filter.replace('Top', 'top ')}`,
    mapsPlayed,
    maps,
    source: {
      name: `HLTV team map stats, pick and ban shares (${filter}, ${from} to ${to})`,
      url: `https://www.hltv.org/stats/teams/maps/${hltvPath}?startDate=${from}&endDate=${to}&rankingFilter=${filter}`,
      retrievedAt: today,
    },
  })
  console.log(`${teamId}: ${Object.keys(maps).length} maps`)
}
