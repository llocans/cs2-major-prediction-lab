/**
 * End-to-end check of the playoff pipeline on made-up data, in a throwaway copy of the repo:
 * a finished Stage 3 → advance into the playoffs → quarterfinal snapshot → bracket results fed round
 * by round through the real Liquipedia parser and logResults → snapshots → final → status.md.
 * Never touches this checkout (see lib/temp-copy.ts); the event is reset to before its first match.
 * Usage: node scripts/check-playoff-flow.ts [event-id]   (exit code 1 if any check fails)
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  EventConfig,
  EventResults,
  EventTeams,
  type MatchResult,
  Snapshot,
  type SwissStage,
  TeamRegistry,
} from '../data/schemas/index.ts'
import { playSwissRounds } from '../engine/simulate-swiss.ts'
import { swissMatchFormat } from '../engine/swiss/format.ts'
import { pairRound } from '../engine/swiss/pairing.ts'
import { buildRecords } from '../engine/swiss/records.ts'
import { stageSeeds } from '../engine/swiss/stage-seeds.ts'
import type { SwissMatch } from '../engine/swiss/types.ts'
import { advanceStage, isSwissStageFinished } from './lib/advance.ts'
import { readJson, repoPath, writeJson } from './lib/files.ts'
import { type ConvertOptions, readBracketPage } from './lib/liquipedia-results.ts'
import { ensureRoundSnapshot, logResults } from './lib/log-results.ts'
import { enterTempCopy, resetEventProgress } from './lib/temp-copy.ts'

const eventId =
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'pgl-major-singapore-2026'
enterTempCopy(import.meta.filename, [eventId], 'cs2-playoff-flow-')
// Back to before the first match, so real advanced seeds and snapshots never get in the way.
resetEventProgress(eventId)

let failures = 0
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}
const dir = repoPath('data/events', eventId)
const config = readJson(`${dir}/config.json`, EventConfig)
const teams = readJson(`${dir}/teams.json`, EventTeams)
const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
const playoffs = config.stages.find((s) => s.type === 'single-elimination')
const lastSwiss = config.stages.find(
  (s): s is SwissStage => s.type === 'swiss' && s.advanceTo === playoffs?.id,
)
if (!playoffs || !lastSwiss) throw new Error('Event has no Swiss stage advancing to playoffs')

// 1. A made-up finished last Swiss stage: teams from other stages fill the open seeds; the higher
//    seed wins every match.
const invited = new Set(
  teams.participants.filter((p) => p.entryStage === lastSwiss.id).map((p) => p.teamId),
)
const fillers = teams.participants.filter((p) => !invited.has(p.teamId)).slice(0, 16 - invited.size)
const participants = teams.participants.map((p) => {
  const index = fillers.findIndex((f) => f.teamId === p.teamId)
  return index === -1
    ? p
    : { ...p, advancedSeeds: { ...p.advancedSeeds, [lastSwiss.id]: invited.size + index + 1 } }
})
writeJson(`${dir}/teams.json`, EventTeams, { ...teams, participants })
const seeds = stageSeeds(participants, lastSwiss.id)
const rules = {
  winsToAdvance: lastSwiss.winsToAdvance,
  lossesToEliminate: lastSwiss.lossesToEliminate,
  initialPairing: lastSwiss.initialPairing,
}
const swiss = playSwissRounds({
  seeds,
  rules,
  format: lastSwiss.format,
  played: [],
  fromRound: 1,
  pairings: (round, so) => pairRound(round, seeds, so, rules),
  play: (higher) => higher,
})
const mapIds = config.mapPool.map((m) => m.id)
const asResult = (m: SwissMatch, index: number): MatchResult => {
  const records = buildRecords(seeds, swiss.slice(0, index))
  const a = records.get(m.teamA)
  const b = records.get(m.teamB)
  if (!a || !b) throw new Error('unknown team')
  const format = swissMatchFormat(a, b, rules, lastSwiss.format)
  const aWins = m.winner === m.teamA
  return {
    id: `${lastSwiss.id}-r${m.round}-${[m.teamA, m.teamB].sort().join('-')}`,
    stageId: lastSwiss.id,
    round: m.round,
    teamA: m.teamA,
    teamB: m.teamB,
    format,
    maps: mapIds
      .slice(0, format === 'bo1' ? 1 : 2)
      .map((map) => ({ map, scoreA: aWins ? 13 : 7, scoreB: aWins ? 7 : 13 })),
    winner: m.winner,
    source: { name: 'made-up check data', retrievedAt: lastSwiss.end },
  }
}
const results = readJson(`${dir}/results.json`, EventResults)
writeJson(`${dir}/results.json`, EventResults, { ...results, matches: swiss.map(asResult) })
check(isSwissStageFinished(eventId, lastSwiss.id), `made-up ${lastSwiss.name} is finished`)

// 2. Advance into the playoffs and save the first-round snapshot.
const advanced = advanceStage(eventId, lastSwiss.id)
check(advanced.status === 'advanced', `advance: ${advanced.status}`)
const po = stageSeeds(readJson(`${dir}/teams.json`, EventTeams).participants, playoffs.id)
check(
  advanced.status === 'advanced' && po.join() === advanced.teams.join(),
  `playoff seeds = advancing order (${po.join(', ')})`,
)
check(ensureRoundSnapshot(eventId, playoffs.id) === 'saved', 'first-round snapshot saved')
check(ensureRoundSnapshot(eventId, playoffs.id) === 'exists', 'asked again: exists')
const simulated = spawnSync(
  process.execPath,
  [repoPath('scripts/simulate.ts'), eventId, playoffs.id],
  { encoding: 'utf8' },
)
check(
  simulated.status === 0 && simulated.stdout.includes('Title') && simulated.stdout.includes('vs'),
  'simulate.ts prints playoff odds and next matches',
)
const first = readJson(`${dir}/snapshots/${playoffs.id}-r1.json`, Snapshot)
check(
  first.matches.length === 4 && first.playoffTeams?.length === 8,
  'snapshot has 4 matches and 8 teams',
)

// 3. Bracket pages filled in round by round, read by the real parser.
const liquipedia = (id: string) => registry.teams.find((t) => t.id === id)?.liquipedia ?? id
interface Slot {
  key: string
  a: string
  b: string
  slots: number
  aWins: boolean
}
const mapText = (k: number, s: Slot) => {
  const need = Math.ceil(s.slots / 2)
  if (k >= need) return `|map${k + 1}={{Map|map=|finished=}}`
  const [t1, t2] = s.aWins ? [13, 7] : [7, 13]
  return `|map${k + 1}={{Map|map=${config.mapPool[k]?.name}|finished=true|t1t=${t1}|t1ct=0|t2t=${t2}|t2ct=0}}`
}
const page = (slots: Slot[]) =>
  `{{Bracket|Bracket/8|id=check\n${slots
    .map(
      (s) =>
        `|${s.key}={{Match|opponent1={{TeamOpponent|${liquipedia(s.a)}}}|opponent2={{TeamOpponent|${liquipedia(s.b)}}}|finished=true\n${Array.from({ length: s.slots }, (_, k) => mapText(k, s)).join('\n')}\n}}`,
    )
    .join('\n')}\n}}`
const convert: ConvertOptions = {
  stageId: playoffs.id,
  resolveTeam: (name) => {
    const team = registry.teams.find((t) => t.liquipedia?.toLowerCase() === name)
    if (!team) throw new Error(`unknown team ${name}`)
    return team.id
  },
  resolveMap: (name) => {
    const map = config.mapPool.find((m) => m.name === name)
    if (!map) throw new Error(`unknown map ${name}`)
    return map.id
  },
  source: { name: 'made-up bracket', retrievedAt: playoffs.start },
}
const log = (slots: Slot[]) =>
  logResults(eventId, playoffs.id, readBracketPage(page(slots), convert).results, 'check')
const playoffResults = () =>
  readJson(`${dir}/results.json`, EventResults).matches.filter((m) => m.stageId === playoffs.id)

const [p1 = '', p2 = '', p3 = '', p4 = '', p5 = '', p6 = '', p7 = '', p8 = ''] = po
// Liquipedia draws 3v6 above 2v7 in the bottom half; the engine must not care.
const qf: Slot[] = [
  { key: 'R1M1', a: p1, b: p8, slots: 3, aWins: false },
  { key: 'R1M2', a: p4, b: p5, slots: 3, aWins: true },
  { key: 'R1M3', a: p3, b: p6, slots: 3, aWins: true },
  { key: 'R1M4', a: p2, b: p7, slots: 3, aWins: true },
]
let mismatch = ''
try {
  log([{ key: 'R1M1', a: p1, b: p7, slots: 3, aWins: true }])
} catch (error) {
  mismatch = String(error)
}
check(
  mismatch.includes('Expected first-round pairs') && playoffResults().length === 0,
  'quarterfinal that our seeding does not produce: clear error, nothing written',
)
let rejected = false
try {
  log([...qf.slice(0, 2), { key: 'R2M2', a: p2, b: p3, slots: 3, aWins: true }])
} catch {
  rejected = true
}
check(
  rejected && playoffResults().length === 0,
  'semifinal before its quarterfinals: rejected, nothing written',
)
check(log(qf.slice(0, 2)).snapshot === 'not-due', 'two quarterfinals: no snapshot yet')
check(log(qf).snapshot === 'saved', 'all quarterfinals: semifinal snapshot saved')
const sf: Slot[] = [
  { key: 'R2M1', a: p4, b: p8, slots: 3, aWins: false },
  { key: 'R2M2', a: p2, b: p3, slots: 3, aWins: true },
]
check(log([...qf, ...sf]).snapshot === 'saved', 'semifinals: final snapshot saved')
const last = readJson(`${dir}/snapshots/${playoffs.id}-r3.json`, Snapshot)
const formats = last.matches
  .map((m) => m.format)
  .sort()
  .join()
check(
  formats ===
    [playoffs.format.thirdPlace ?? playoffs.format.default, playoffs.format.final].sort().join(),
  `final and third place formats (${formats})`,
)
// Third place first, on a page without the final's slot: its round must still be the final's.
const third: Slot = { key: 'RxMTP', a: p3, b: p4, slots: 3, aWins: true }
check(log([...qf, ...sf, third]).logged.length === 1, 'third place logged')
// A Bo5 final shown as finished at 2-0 on a page with the spare map slots removed: held back.
const early = log([...qf, ...sf, third, { key: 'R3M1', a: p2, b: p8, slots: 3, aWins: true }])
check(
  early.logged.length === 0 && early.held.length === 1,
  `final at 2-0 with 3 map slots: held back (${early.held.join('; ')})`,
)
const final: Slot = { key: 'R3M1', a: p2, b: p8, slots: 5, aWins: true }
const done = log([...qf, ...sf, third, final])
check(
  done.logged.length === 1 && done.snapshot === 'done',
  `final logged, stage done (${done.snapshot})`,
)
const stored = playoffResults()
check(
  stored.length === 8 && stored.filter((m) => m.round === 3).length === 2,
  'eight results, final and third place both in round 3',
)
check(
  stored.filter((m) => m.format === playoffs.format.final).length === 1,
  `formats from the bracket slots (one ${playoffs.format.final})`,
)
const status = readFileSync(`${dir}/status.md`, 'utf8')
check(status.includes(`${playoffs.name}, finished`), 'status.md says the playoffs are finished')

console.log(failures === 0 ? 'All playoff flow checks passed.' : `${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
