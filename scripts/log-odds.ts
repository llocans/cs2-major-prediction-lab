/**
 * Logs one bookmaker's match-winner odds for a round, for the Market odds page. Only the margin-free
 * probability is stored, never the decimal odds (docs/sources.md). Re-logging a pair replaces it.
 * Usage:
 *   node scripts/log-odds.ts <event> <stage> <round> <teamA> <oddsA> <teamB> <oddsB> [...] --source "<name>|<url>" [--date YYYY-MM-DD]
 * Example:
 *   node scripts/log-odds.ts pgl-major-singapore-2026 stage-1 3 parivision 1.78 faze 2.08 --source "CSGOEmpire match-winner odds, margin removed|https://csgoempire.com/match-betting"
 * `--date` is for odds read on an earlier day (e.g. from a screenshot); without it the odds count as
 * read now and get a timestamp.
 */
import { existsSync } from 'node:fs'
import { BookmakerOdds, EventTeams } from '../data/schemas/index.ts'
import { marginFree } from '../engine/market-picks.ts'
import { readJson, repoPath, writeJson } from './lib/files.ts'

function option(args: string[], name: string): { value?: string; rest: string[] } {
  const index = args.indexOf(name)
  if (index === -1) return { rest: args }
  const value = args[index + 1]
  if (value === undefined) throw new Error(`${name} needs a value`)
  return { value, rest: [...args.slice(0, index), ...args.slice(index + 2)] }
}

const source = option(process.argv.slice(2), '--source')
const date = option(source.rest, '--date')
const [eventId, stageId, roundArg, ...quads] = date.rest

if (!eventId || !stageId || !roundArg || !source.value || quads.length === 0 || quads.length % 4) {
  console.error(
    'Usage: node scripts/log-odds.ts <event> <stage> <round> <teamA> <oddsA> <teamB> <oddsB> [...] --source "<name>|<url>" [--date YYYY-MM-DD]',
  )
  process.exit(1)
}

const round = Number(roundArg)
const teams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
const known = new Set(teams.participants.map((p) => p.teamId))
const [sourceName, sourceUrl] = source.value.split('|')
const now = new Date()
const retrievedAt = date.value ?? now.toISOString().slice(0, 10)

const logged = Array.from({ length: quads.length / 4 }, (_, i) => {
  const [teamA = '', oddsA = '', teamB = '', oddsB = ''] = quads.slice(i * 4, i * 4 + 4)
  for (const team of [teamA, teamB]) {
    if (!known.has(team)) throw new Error(`Unknown team id "${team}" in ${eventId}/teams.json`)
  }
  return {
    stageId,
    round,
    teamA,
    teamB,
    pA: Math.round(marginFree(Number(oddsA), Number(oddsB)) * 10000) / 10000,
    source: {
      name: sourceName ?? '',
      ...(sourceUrl ? { url: sourceUrl } : {}),
      retrievedAt,
    },
    ...(date.value ? {} : { observedAt: now.toISOString().replace(/\.\d+Z$/, 'Z') }),
  }
})

const path = repoPath('data/events', eventId, 'bookmaker-odds.json')
const file: BookmakerOdds = existsSync(path)
  ? readJson(path, BookmakerOdds)
  : { schemaVersion: 1, eventId, entries: [] }
const pair = (a: string, b: string) => [a, b].sort().join('|')
const replaced = new Set(logged.map((e) => `${e.stageId}|${e.round}|${pair(e.teamA, e.teamB)}`))
const kept = file.entries.filter(
  (e) => !replaced.has(`${e.stageId}|${e.round}|${pair(e.teamA, e.teamB)}`),
)
writeJson(path, BookmakerOdds, { ...file, entries: [...kept, ...logged] })

for (const entry of logged) {
  const pB = 1 - entry.pA
  console.log(
    `${entry.teamA} ${(entry.pA * 100).toFixed(1)}% vs ${entry.teamB} ${(pB * 100).toFixed(1)}%`,
  )
}
console.log(
  `${logged.length} logged in ${stageId} round ${round} (${file.entries.length - kept.length} replaced)`,
)
