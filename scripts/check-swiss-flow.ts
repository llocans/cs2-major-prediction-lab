/**
 * End-to-end check of the Swiss pipeline on made-up data, in a throwaway copy of the repo: the event
 * reset to before its first match, then every Swiss stage fed round by round as Liquipedia Matchlist
 * pages through the poller's own code (applySwissPage): round start, a part-played round with a Bo3
 * in progress, the same page again, the finished round → snapshots → advance into the next stage →
 * its round 1 snapshot, until the playoffs are seeded. Stage pairings that differ from ours (once
 * announced early, once not) must not stop it.
 * Never touches this checkout (see lib/temp-copy.ts).
 * Usage: node scripts/check-swiss-flow.ts [event-id]   (exit code 1 if any check fails)
 */
import { existsSync, readFileSync } from 'node:fs'
import {
  EventConfig,
  EventResults,
  EventTeams,
  ModelParams,
  Snapshot,
  type SwissStage,
  TeamRegistry,
} from '../data/schemas/index.ts'
import { playSwissRounds } from '../engine/simulate-swiss.ts'
import { swissMatchFormat } from '../engine/swiss/format.ts'
import { pairRound } from '../engine/swiss/pairing.ts'
import { buildRecords } from '../engine/swiss/records.ts'
import { stageSeeds } from '../engine/swiss/stage-seeds.ts'
import type { Pairing, SwissMatch } from '../engine/swiss/types.ts'
import { advanceStage, isSwissStageFinished, isSwissStageSeeded } from './lib/advance.ts'
import { readJson, repoPath, writeJson } from './lib/files.ts'
import { applySwissPage, convertOptions } from './lib/poll-stage.ts'
import { enterTempCopy, resetEventProgress } from './lib/temp-copy.ts'

const eventId =
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'pgl-major-singapore-2026'
enterTempCopy(import.meta.filename, [eventId], 'cs2-swiss-flow-')

let failures = 0
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}
/** Runs a step that must not throw; a throw is a failed check, and the rest is skipped. */
const step = <T>(what: string, run: () => T): T => {
  try {
    return run()
  } catch (error) {
    check(false, `${what}: ${String(error)}`)
    console.log(`${failures} check(s) failed.`)
    process.exit(1)
  }
}

resetEventProgress(eventId)
// Few simulation runs: this checks the pipeline, not the odds (about 50 pages are simulated).
const paramsPath = repoPath('data/model/params.json')
const params = readJson(paramsPath, ModelParams)
writeJson(paramsPath, ModelParams, { ...params, sim: { ...params.sim, runs: 300 } })
const dir = repoPath('data/events', eventId)
const config = readJson(`${dir}/config.json`, EventConfig)
const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
const teamsNow = () => readJson(`${dir}/teams.json`, EventTeams).participants
const stageResults = (stageId: string) =>
  readJson(`${dir}/results.json`, EventResults).matches.filter((m) => m.stageId === stageId)
const swissStages = config.stages.filter((s): s is SwissStage => s.type === 'swiss')
const ratingsBefore = readFileSync(repoPath('data/ratings/current.json'), 'utf8')

const pairKey = (p: Pairing) => [p.teamA, p.teamB].sort().join(' v ')
const samePairs = (a: readonly Pairing[], b: readonly Pairing[]) =>
  a.map(pairKey).sort().join() === b.map(pairKey).sort().join()
/** Made-up winner: the first-listed team, except in about one match in three. */
const upset = (a: string, b: string) => {
  let hash = 7
  for (const char of `${a}|${b}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 3 === 0
}
/** Swaps the opponents of the first two pairs whose teams share a record (no rematch in round 2). */
function swapOpponents(pairs: Pairing[], records: ReturnType<typeof buildRecords>): Pairing[] {
  const group = (id: string) => `${records.get(id)?.wins}-${records.get(id)?.losses}`
  const i = pairs.findIndex((p, k) =>
    pairs.some((q, l) => l > k && group(q.teamA) === group(p.teamA)),
  )
  const first = pairs[i]
  const j = pairs.findIndex((q, l) => l > i && first && group(q.teamA) === group(first.teamA))
  const second = pairs[j]
  if (!first || !second) throw new Error('no two pairs in one record group')
  const swapped = [...pairs]
  swapped[i] = { teamA: first.teamA, teamB: second.teamB }
  swapped[j] = { teamA: second.teamA, teamB: first.teamB }
  return swapped
}

// Liquipedia's view of a match: names, and map slots by format.
const liquipedia = (id: string) => registry.teams.find((t) => t.id === id)?.liquipedia ?? id
interface Row extends Pairing {
  round: number
  format: 'bo1' | 'bo3' | 'bo5'
  /** Absent: announced only. */
  winner?: string
  /** Bo3 with one map played. */
  live?: boolean
}
const mapText = (k: number, aWonMap: boolean | undefined) => {
  if (aWonMap === undefined) return `|map${k + 1}={{Map|map=|finished=}}`
  const [t1, t2] = aWonMap ? [13, 7] : [7, 13]
  return `|map${k + 1}={{Map|map=${config.mapPool[k]?.name}|finished=true|t1t=${t1}|t1ct=0|t2t=${t2}|t2ct=0}}`
}
const matchText = (row: Row, index: number) => {
  const slots = row.format === 'bo1' ? 1 : 3
  const aWins = row.winner === row.teamA
  // Bo3s go 2-1; a live Bo3 stands at 1-0 for the first team.
  const maps =
    row.live === true
      ? [true]
      : row.winner === undefined
        ? []
        : slots === 1
          ? [aWins]
          : [aWins, !aWins, aWins]
  const finished = row.winner === undefined ? '' : 'true'
  return `|M${index + 1}={{Match|opponent1={{TeamOpponent|${liquipedia(row.teamA)}}}|opponent2={{TeamOpponent|${liquipedia(row.teamB)}}}|finished=${finished}\n${Array.from(
    { length: slots },
    (_, k) => mapText(k, maps[k]),
  ).join('\n')}\n}}`
}
const page = (rows: readonly Row[]) =>
  [1, 2, 3, 4, 5]
    .map((round) => rows.filter((r) => r.round === round))
    .filter((list) => list.length > 0)
    .map(
      (list) =>
        `{{Matchlist|id=r${list[0]?.round}|matchsection=Round ${list[0]?.round}\n${list.map(matchText).join('\n')}\n}}`,
    )
    .join('\n')

for (const [index, stage] of swissStages.entries()) {
  const label = stage.name
  check(isSwissStageSeeded(eventId, stage.id), `${label}: ${stage.teamCount} teams seeded`)
  const seeds = stageSeeds(teamsNow(), stage.id)
  const rules = {
    winsToAdvance: stage.winsToAdvance,
    lossesToEliminate: stage.lossesToEliminate,
    initialPairing: stage.initialPairing,
  }
  // The first stage's round 2 is drawn differently from our pairing and announced on the page as
  // soon as round 1 ends; the second stage's too, but only announced when round 2 starts.
  const swapRound2 = index <= 1
  const announceEarly = index === 0
  const matches: SwissMatch[] = playSwissRounds({
    seeds,
    rules,
    format: stage.format,
    played: [],
    fromRound: 1,
    pairings: (round, so) => {
      const pairs = pairRound(round, seeds, so, rules)
      return round === 2 && swapRound2 ? swapOpponents(pairs, buildRecords(seeds, so)) : pairs
    },
    play: (a, b) => (upset(a, b) ? b : a),
  })
  const rows: Row[] = matches.map((m) => {
    const records = buildRecords(
      seeds,
      matches.filter((x) => x.round < m.round),
    )
    const a = records.get(m.teamA)
    const b = records.get(m.teamB)
    if (!a || !b) throw new Error('unknown team')
    return { ...m, format: swissMatchFormat(a, b, rules, stage.format) }
  })
  const convert = convertOptions(config, registry, stage.id, {
    name: 'made-up stage page',
    retrievedAt: stage.start,
  })
  const apply = (what: string, list: Row[]) =>
    step(`${label} ${what}`, () => applySwissPage(eventId, stage.id, page(list), convert, 'check'))
  const announcedOnly = (list: Row[]) => list.map(({ winner: _, live: __, ...r }) => r)
  const snapshotPairs = (round: number) => {
    const path = `${dir}/snapshots/${stage.id}-r${round}.json`
    return existsSync(path) ? readJson(path, Snapshot).matches : []
  }

  for (let round = 1; round <= 5; round++) {
    const done = rows.filter((r) => r.round < round)
    const now = rows.filter((r) => r.round === round)
    const next = rows.filter((r) => r.round === round + 1)
    const tag = `round ${round}`

    // Round start: the page lists the round's pairings, no results yet.
    const start = apply(`${tag} start`, [...done, ...announcedOnly(now)])
    const expectStart = round === 1 && index === 0 ? 'saved' : 'exists'
    check(
      start.logged.length === 0 && start.snapshot === expectStart,
      `${label} ${tag} start: nothing new, snapshot ${start.snapshot} (expected ${expectStart})`,
    )
    const predicted = snapshotPairs(round)
    const wrongDraw = round === 2 && swapRound2 && !announceEarly
    check(
      predicted.length === now.length && samePairs(predicted, now) !== wrongDraw,
      `${label} ${tag}: snapshot pairs ${wrongDraw ? 'differ from the real draw (not announced in time)' : 'match the real draw'}`,
    )

    // Part-played: half the matches finished, one Bo3 live at 1-0 (if any), the rest announced.
    const half = Math.floor(now.length / 2)
    const rest = now.slice(half)
    const liveIndex = rest.findIndex((r) => r.format === 'bo3')
    const partRows = [
      ...done,
      ...now.slice(0, half),
      ...rest.map((r, k) => {
        const { winner: _, ...pairing } = r
        return k === liveIndex ? { ...pairing, live: true } : pairing
      }),
    ]
    const part = apply(`${tag} part-played`, partRows)
    check(
      part.logged.length === half && part.snapshot === 'not-due',
      `${label} ${tag} part-played: ${part.logged.length}/${half} logged${liveIndex === -1 ? '' : ', live Bo3 not logged'}, snapshot ${part.snapshot}`,
    )
    const again = apply(`${tag} same page again`, partRows)
    check(
      again.logged.length === 0 && again.skipped.length === done.length + half,
      `${label} ${tag} same page again: nothing new`,
    )

    // Round finished (the first stage's page also shows the next round's draw already).
    const early = round === 1 && announceEarly ? announcedOnly(next) : []
    const end = apply(`${tag} finished`, [...done, ...now, ...early])
    const expectEnd = round < 5 ? 'saved' : 'done'
    check(
      end.logged.length === now.length - half && end.snapshot === expectEnd,
      `${label} ${tag} finished: ${end.logged.length} logged, snapshot ${end.snapshot} (expected ${expectEnd})`,
    )
  }

  const stored = stageResults(stage.id)
  check(stored.length === rows.length, `${label}: ${stored.length} results stored`)
  check(
    rows.every((r) =>
      stored.some((m) => pairKey(m) === pairKey(r) && m.round === r.round && m.format === r.format),
    ),
    `${label}: rounds and formats as drawn (Bo3 for advancement and elimination matches)`,
  )
  check(isSwissStageFinished(eventId, stage.id), `${label}: finished`)
  const missing = [1, 2, 3, 4, 5].filter(
    (r) => !existsSync(`${dir}/snapshots/${stage.id}-r${r}.json`),
  )
  check(
    missing.length === 0,
    `${label}: snapshots for rounds 1-5${missing.length ? ` (missing ${missing.join()})` : ''}`,
  )

  // Advance: done by the last page above, like the poller.
  const nextStage = config.stages.find((s) => s.id === stage.advanceTo)
  if (!nextStage) continue
  const winners = buildRecords(seeds, matches)
  const advanced = [...winners.values()]
    .filter((r) => r.wins >= stage.winsToAdvance)
    .map((r) => r.teamId)
  const nextSeeds = stageSeeds(teamsNow(), nextStage.id)
  const invited = teamsNow()
    .filter((p) => p.entryStage === nextStage.id)
    .map((p) => p.teamId)
  const size = nextStage.type === 'swiss' ? nextStage.teamCount : nextStage.bracket.length * 2
  check(
    nextSeeds.length === size &&
      nextSeeds.slice(invited.length).sort().join() === advanced.sort().join() &&
      nextSeeds.slice(0, invited.length).sort().join() === invited.sort().join(),
    invited.length > 0
      ? `${nextStage.name}: invited teams seeds 1-${invited.length}, the ${advanced.length} that advanced after them`
      : `${nextStage.name}: seeded with the ${advanced.length} that advanced`,
  )
  check(
    existsSync(`${dir}/snapshots/${nextStage.id}-r1.json`),
    `${nextStage.name}: first-round snapshot saved on advance`,
  )
  check(
    advanceStage(eventId, stage.id).status === 'already',
    `${label}: advancing again does nothing`,
  )
  if (nextStage.type === 'swiss') {
    const status = readFileSync(`${dir}/status.md`, 'utf8')
    check(
      status.includes(`${nextStage.name}, round 1 next`),
      `status.md moved on to ${nextStage.name}`,
    )
  }
}

check(
  readFileSync(repoPath('data/ratings/current.json'), 'utf8') !== ratingsBefore,
  'ratings updated from the results',
)
console.log(failures === 0 ? 'All Swiss flow checks passed.' : `${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
