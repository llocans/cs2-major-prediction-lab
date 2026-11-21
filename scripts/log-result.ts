/**
 * Records one real result by hand (manual fallback to the poller).
 * Usage:
 *   node scripts/log-result.ts <event-id> <stage-id> <round> <teamA> <teamB> <map:scoreA-scoreB>... [--source "<name>|<url>"]
 * Example:
 *   node scripts/log-result.ts pgl-major-singapore-2026 stage-1 1 heroic imperial nuke:13-9 --source "HLTV|https://www.hltv.org/matches/2400494"
 * Scores are from teamA's side. The winner and format follow from the maps (1 map = Bo1, otherwise Bo3).
 */
import { MatchResult } from '../data/schemas/index.ts'
import { logResults } from './lib/log-results.ts'

const args = process.argv.slice(2)
const sourceIndex = args.indexOf('--source')
const sourceArg = sourceIndex === -1 ? undefined : args[sourceIndex + 1]
const positional = sourceIndex === -1 ? args : args.slice(0, sourceIndex)
const [eventId, stageId, roundArg, teamA, teamB, ...mapArgs] = positional

if (!eventId || !stageId || !roundArg || !teamA || !teamB || mapArgs.length === 0 || !sourceArg) {
  console.error(
    'Usage: node scripts/log-result.ts <event> <stage> <round> <teamA> <teamB> <map:a-b>... --source "<name>|<url>"',
  )
  process.exit(1)
}

const maps = mapArgs.map((arg) => {
  const match = /^([a-z0-9]+):(\d+)-(\d+)$/.exec(arg)
  if (!match?.[1] || !match[2] || !match[3])
    throw new Error(`Bad map argument "${arg}" (use nuke:13-9)`)
  return { map: match[1], scoreA: Number(match[2]), scoreB: Number(match[3]) }
})
const winsA = maps.filter((m) => m.scoreA > m.scoreB).length
const winsB = maps.length - winsA
const format = maps.length === 1 ? 'bo1' : maps.length <= 3 ? 'bo3' : 'bo5'
const [sourceName, sourceUrl] = sourceArg.split('|')

const result = MatchResult.parse({
  id: `${stageId}-r${roundArg}-${[teamA, teamB].sort().join('-')}`,
  stageId,
  round: Number(roundArg),
  teamA,
  teamB,
  format,
  maps,
  winner: winsA > winsB ? teamA : teamB,
  source: {
    name: sourceName,
    ...(sourceUrl ? { url: sourceUrl } : {}),
    retrievedAt: new Date().toISOString().slice(0, 10),
  },
})

const outcome = logResults(eventId, stageId, [result], 'log-result (manual)')
for (const skipped of outcome.skipped) console.log(`already logged: ${skipped}`)
for (const logged of outcome.logged) console.log(`logged: ${logged.id} (winner ${logged.winner})`)
console.log(`snapshot: ${outcome.snapshot}`)
