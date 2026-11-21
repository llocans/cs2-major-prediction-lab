/**
 * The single pipeline for recording real results, used by the CLI (log-result) and the poller:
 * validate → append to results.json → update ratings → re-simulate → snapshot at round boundaries
 * → status.md → changelog line.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { EventResults, type MatchResult, ModelParams } from '../../data/schemas/index.ts'
import { predictStage } from '../../engine/predict.ts'
import { updateRatings } from '../../engine/ratings/update.ts'
import { currentRound } from '../../engine/simulate-swiss.ts'
import type { Pairing } from '../../engine/swiss/types.ts'
import { loadStageContext } from './event-context.ts'
import { readJson, repoPath, writeJson } from './files.ts'
import { loadRatings, saveRatings } from './ratings-store.ts'
import { saveRoundSnapshot } from './snapshot.ts'
import { writeStatus } from './status.ts'

export interface LogOutcome {
  logged: MatchResult[]
  skipped: string[]
  snapshot: 'saved' | 'exists' | 'done' | 'not-due'
}

const sameMatch = (a: MatchResult, b: MatchResult) =>
  a.stageId === b.stageId &&
  a.round === b.round &&
  [a.teamA, a.teamB].sort().join() === [b.teamA, b.teamB].sort().join()

export function logResults(
  eventId: string,
  stageId: string,
  incoming: readonly MatchResult[],
  actor: string,
  announced?: ReadonlyMap<number, Pairing[]>,
): LogOutcome {
  const resultsPath = repoPath('data/events', eventId, 'results.json')
  const results = readJson(resultsPath, EventResults)
  const before = loadStageContext(eventId, stageId)
  const seeds = new Set(before.simInput.seeds)
  const pool = new Set(before.config.mapPool.map((map) => map.id))

  const logged: MatchResult[] = []
  const skipped: string[] = []
  for (const match of [...incoming].sort((a, b) => a.round - b.round)) {
    const label = `${match.stageId} R${match.round} ${match.teamA} v ${match.teamB}`
    if (match.stageId !== stageId) throw new Error(`${label}: wrong stage (expected ${stageId})`)
    if (!seeds.has(match.teamA) || !seeds.has(match.teamB)) {
      throw new Error(`${label}: team not in ${stageId}`)
    }
    for (const map of match.maps) {
      if (!pool.has(map.map)) throw new Error(`${label}: map "${map.map}" is not in the map pool`)
    }
    if ([...results.matches, ...logged].some((existing) => sameMatch(existing, match))) {
      skipped.push(label)
      continue
    }
    logged.push(match)
  }
  if (logged.length === 0) return { logged, skipped, snapshot: 'not-due' }

  writeJson(resultsPath, EventResults, { ...results, matches: [...results.matches, ...logged] })

  const params = readJson(repoPath('data/model/params.json'), ModelParams)
  let ratings = loadRatings()
  for (const match of logged) {
    ratings = updateRatings(
      ratings,
      {
        teamA: match.teamA,
        teamB: match.teamB,
        format: match.format,
        maps: match.maps.map((m) => ({ map: m.map, scoreA: m.scoreA, scoreB: m.scoreB })),
      },
      params,
      new Date().toISOString(),
      `log-result ${match.id}`,
    )
  }
  saveRatings(ratings)

  const snapshot = ensureRoundSnapshot(eventId, stageId, announced)

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  appendChangelog(
    `- ${stamp} UTC · ${actor} · logged ${logged.length} result(s) in ${stageId}; ratings updated; snapshot ${snapshot}`,
  )
  return { logged, skipped, snapshot }
}

/**
 * Re-simulates the stage and saves the pre-round snapshot if the current round has not started.
 * Uses announced pairings for that round when Liquipedia already lists them. Also refreshes status.md.
 */
export function ensureRoundSnapshot(
  eventId: string,
  stageId: string,
  announced?: ReadonlyMap<number, Pairing[]>,
): LogOutcome['snapshot'] {
  const plain = loadStageContext(eventId, stageId)
  const round = currentRound(plain.simInput.seeds, plain.simInput.played, plain.simInput.rules)
  const pairings = announced?.get(round)
  const context = pairings ? loadStageContext(eventId, stageId, { announced: pairings }) : plain
  writeStatus(context, predictStage(context.simInput, context.labels))
  if (round > 5) return 'done'
  if (context.simInput.played.some((m) => m.round === round)) return 'not-due'
  return saveRoundSnapshot(context).status
}

/** Inserts a line right after the format line of docs/changelog.md (newest first). */
function appendChangelog(line: string): void {
  const path = repoPath('docs/changelog.md')
  const text = readFileSync(path, 'utf8')
  const marker = '\n- '
  const index = text.indexOf(marker)
  if (index === -1) {
    appendFileSync(path, `${line}\n`)
    return
  }
  writeFileSync(path, `${text.slice(0, index + 1)}${line}\n${text.slice(index + 1)}`)
}
