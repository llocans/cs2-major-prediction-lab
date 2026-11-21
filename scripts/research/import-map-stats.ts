/**
 * Imports map W-L counts collected interactively from HLTV team map stats into
 * data/teams/maps/<team-id>.json. Input is a small text file, one team per line:
 *   <team-id> <hltv-team-path> <map>:<won>/<lost> ...
 * e.g. "nip 4411/ninjas-in-pyjamas nuke:6/1 cache:6/7"
 * Usage: node scripts/research/import-map-stats.ts <input.txt> <from YYYY-MM-DD> <to YYYY-MM-DD> <filter>
 * The filter must match the HLTV query used, e.g. "Top50" (opponents ranked top 50 on HLTV).
 */
import { readFileSync } from 'node:fs'
import { TeamMapStats } from '../../data/schemas/index.ts'
import { repoPath, writeJson } from '../lib/files.ts'

const [input, from, to, filter] = process.argv.slice(2)
if (!input || !from || !to || !filter) {
  console.error('Usage: node scripts/research/import-map-stats.ts <input.txt> <from> <to> <filter>')
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
for (const line of readFileSync(input, 'utf8').split('\n')) {
  const [teamId, hltvPath, ...pairs] = line.trim().split(/\s+/)
  if (!teamId || !hltvPath || pairs.length === 0) continue
  const maps: Record<string, { won: number; played: number }> = {}
  for (const pair of pairs) {
    const match = /^([a-z0-9]+):(\d+)\/(\d+)$/.exec(pair)
    if (!match?.[1] || !match[2] || !match[3]) throw new Error(`${teamId}: bad entry "${pair}"`)
    const won = Number(match[2])
    maps[match[1]] = { won, played: won + Number(match[3]) }
  }
  const overall = Object.values(maps).reduce(
    (sum, m) => ({ won: sum.won + m.won, played: sum.played + m.played }),
    { won: 0, played: 0 },
  )
  writeJson(repoPath('data/teams/maps', `${teamId}.json`), TeamMapStats, {
    schemaVersion: 1,
    teamId,
    window: { from, to },
    filter: `vs HLTV ${filter.replace('Top', 'top ')}`,
    overall,
    maps,
    source: {
      name: `HLTV team map stats (${filter}, ${from} to ${to})`,
      url: `https://www.hltv.org/stats/teams/maps/${hltvPath}?startDate=${from}&endDate=${to}&rankingFilter=${filter}`,
      retrievedAt: today,
    },
  })
  console.log(
    `${teamId}: ${overall.won}-${overall.played - overall.won} over ${overall.played} maps`,
  )
}
