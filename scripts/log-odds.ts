/**
 * Logs one bookmaker's match-winner odds for a round, for the Market odds page. The committed
 * `bookmaker-odds.json` gets the margin-free probability; the decimal odds go to the git-ignored
 * `local/market-odds.json` (never committed, docs/sources.md). Re-logging a pair replaces it.
 * Usage:
 *   node scripts/log-odds.ts <event> <stage> <round> <teamA> <oddsA> <teamB> <oddsB> [...] --source "<name>|<url>" [--date YYYY-MM-DD] [--starts <ISO>,<ISO>,...]
 * Example:
 *   node scripts/log-odds.ts pgl-major-singapore-2026 stage-1 3 parivision 1.78 faze 2.08 --source "CSGOEmpire match-winner odds, margin removed|https://csgoempire.com/match-betting"
 * `--date` is for odds read on an earlier day (e.g. from a screenshot); without it the odds count as
 * read now and get a timestamp. `--starts` gives each pair's kickoff as the bookmaker lists it, in
 * the same order as the pairs (UTC, e.g. 2026-11-28T04:00Z); odds read after a kickoff never go into
 * a bet slip. Afterwards the round's bet slips are built (`scripts/build-slips.ts`) when the stage's
 * `marketRule` has a slips rule.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  BookmakerOdds,
  EventConfig,
  EventSlips,
  EventTeams,
  LocalMarketOdds,
} from '../data/schemas/index.ts'
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
const starts = option(date.rest, '--starts')
const [eventId, stageId, roundArg, ...quads] = starts.rest

if (!eventId || !stageId || !roundArg || !source.value || quads.length === 0 || quads.length % 4) {
  console.error(
    'Usage: node scripts/log-odds.ts <event> <stage> <round> <teamA> <oddsA> <teamB> <oddsB> [...] --source "<name>|<url>" [--date YYYY-MM-DD] [--starts <ISO>,...]',
  )
  process.exit(1)
}

const round = Number(roundArg)
const teams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
const known = new Set(teams.participants.map((p) => p.teamId))
const [sourceName, sourceUrl] = source.value.split('|')
const now = new Date()
const retrievedAt = date.value ?? now.toISOString().slice(0, 10)
const kickoffs = starts.value?.split(',').map((t) => {
  const iso = new Date(t.trim())
  if (Number.isNaN(iso.getTime())) throw new Error(`--starts: "${t}" is not a date and time`)
  return iso.toISOString().replace(/\.\d+Z$/, 'Z')
})
// Slips need each kickoff, so odds read after a match starts never go into one.
const slipsRule = readJson(
  repoPath('data/events', eventId, 'config.json'),
  EventConfig,
).stages.find((s) => s.id === stageId)?.marketRule?.slips
if (slipsRule && !kickoffs && !date.value) {
  throw new Error(`${stageId} builds bet slips: give each pair's kickoff with --starts`)
}
if (kickoffs && kickoffs.length !== quads.length / 4) {
  throw new Error(`--starts has ${kickoffs.length} times for ${quads.length / 4} pairs`)
}

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
    ...(kickoffs?.[i] ? { startsAt: kickoffs[i] } : {}),
  }
})

const path = repoPath('data/events', eventId, 'bookmaker-odds.json')
const file: BookmakerOdds = existsSync(path)
  ? readJson(path, BookmakerOdds)
  : { schemaVersion: 1, eventId, entries: [] }
const pair = (a: string, b: string) => [a, b].sort().join('|')
const keyOf = (e: { stageId: string; round: number; teamA: string; teamB: string }) =>
  `${e.stageId}|${e.round}|${pair(e.teamA, e.teamB)}`

// A pair already in a frozen bet slip keeps the odds it was slipped at.
const slipsPath = repoPath('data/events', eventId, 'slips.json')
if (existsSync(slipsPath)) {
  const slipped = new Set(
    readJson(slipsPath, EventSlips).batches.flatMap((b) =>
      b.slips.flatMap((s) => s.legs.map((l) => keyOf({ ...b, ...l }))),
    ),
  )
  const clash = logged.filter((e) => slipped.has(keyOf(e)))
  if (clash.length > 0) {
    throw new Error(
      `Already in a bet slip, not re-logged: ${clash.map((e) => `${e.teamA}-${e.teamB}`).join(', ')}`,
    )
  }
}

const replaced = new Set(logged.map(keyOf))
const previous = new Map(file.entries.map((e) => [keyOf(e), e]))
const kept = file.entries.filter((e) => !replaced.has(keyOf(e)))
// Re-logging without --starts keeps a pair's known kickoff.
const withKickoff = logged.map((e) => {
  const startsAt = previous.get(keyOf(e))?.startsAt
  return 'startsAt' in e || !startsAt ? e : { ...e, startsAt }
})
writeJson(path, BookmakerOdds, { ...file, entries: [...kept, ...withKickoff] })

// The decimal odds, kept locally for real payouts (git-ignored).
const localPath = repoPath('data/events', eventId, 'local', 'market-odds.json')
const localFile: LocalMarketOdds = existsSync(localPath)
  ? readJson(localPath, LocalMarketOdds)
  : { schemaVersion: 1, eventId, entries: [] }
const localLogged = Array.from({ length: quads.length / 4 }, (_, i) => {
  const [teamA = '', oddsA = '', teamB = '', oddsB = ''] = quads.slice(i * 4, i * 4 + 4)
  const observedAt = logged[i]?.observedAt
  return {
    stageId,
    round,
    teamA,
    teamB,
    oddsA: Number(oddsA),
    oddsB: Number(oddsB),
    retrievedAt,
    ...(observedAt ? { observedAt } : {}),
  }
})
writeJson(localPath, LocalMarketOdds, {
  ...localFile,
  entries: [
    ...localFile.entries.filter(
      (e) => !replaced.has(`${e.stageId}|${e.round}|${pair(e.teamA, e.teamB)}`),
    ),
    ...localLogged,
  ],
})

for (const entry of logged) {
  const pB = 1 - entry.pA
  console.log(
    `${entry.teamA} ${(entry.pA * 100).toFixed(1)}% vs ${entry.teamB} ${(pB * 100).toFixed(1)}%`,
  )
}
console.log(
  `${logged.length} logged in ${stageId} round ${round} (${file.entries.length - kept.length} replaced)`,
)

// This reading is a batch: build the round's bet slips from the picks not in a slip yet.
execFileSync(
  process.execPath,
  [repoPath('scripts/build-slips.ts'), eventId, stageId, String(round)],
  {
    stdio: 'inherit',
  },
)
