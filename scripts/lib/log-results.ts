/**
 * The single pipeline for recording real results, used by the CLI (log-result) and the poller:
 * validate → append to results.json → update ratings → re-simulate → snapshot at round boundaries
 * → status.md → changelog line.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { winsNeeded } from '../../data/schemas/common.ts'
import {
  EventConfig,
  EventResults,
  type MatchResult,
  ModelParams,
  Modifiers,
  type PlayoffStage,
} from '../../data/schemas/index.ts'
import { type BracketMatch, roundCount } from '../../engine/playoffs/bracket.ts'
import { realBracket } from '../../engine/playoffs/simulate-playoffs.ts'
import { predictStage } from '../../engine/predict.ts'
import { predictPlayoffs } from '../../engine/predict-playoffs.ts'
import { activeModifiers } from '../../engine/ratings/modifiers.ts'
import { updateRatings } from '../../engine/ratings/update.ts'
import { currentRound } from '../../engine/simulate-swiss.ts'
import { stageSeeds } from '../../engine/swiss/stage-seeds.ts'
import type { Pairing } from '../../engine/swiss/types.ts'
import { loadEventData, loadPlayoffContext, loadStageContext } from './event-context.ts'
import { readJson, repoPath, writeJson } from './files.ts'
import { loadRatings, saveRatings } from './ratings-store.ts'
import { savePlayoffSnapshot, saveRoundSnapshot } from './snapshot.ts'
import { writePlayoffStatus, writeStatus } from './status.ts'

export interface LogOutcome {
  logged: MatchResult[]
  skipped: string[]
  /** Results held back because they do not fit (yet), e.g. a bracket match whose maps don't match its format. */
  held: string[]
  snapshot: 'saved' | 'exists' | 'done' | 'not-due'
}

const pair = (m: MatchResult) => [m.teamA, m.teamB].sort().join()
/** Same match: same stage and pair, and in a Swiss stage the same round (a pair meets once in a bracket). */
const sameMatch = (a: MatchResult, b: MatchResult, bracket: boolean) =>
  a.stageId === b.stageId && pair(a) === pair(b) && (bracket || a.round === b.round)

export function logResults(
  eventId: string,
  stageId: string,
  incoming: readonly MatchResult[],
  actor: string,
  announced?: ReadonlyMap<number, Pairing[]>,
): LogOutcome {
  const resultsPath = repoPath('data/events', eventId, 'results.json')
  const results = readJson(resultsPath, EventResults)
  const event = loadEventData(eventId)
  const stage = event.config.stages.find((s) => s.id === stageId)
  if (!stage) throw new Error(`${eventId}: no stage "${stageId}"`)
  const seedList = stageSeeds(event.teams.participants, stageId)
  const expected = stage.type === 'swiss' ? stage.teamCount : stage.bracket.length * 2
  if (seedList.length !== expected) {
    throw new Error(`${stageId}: expected ${expected} seeded teams, found ${seedList.length}`)
  }
  const seeds = new Set(seedList)
  const pool = new Set(event.config.mapPool.map((map) => map.id))

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
    const bracket = stage.type === 'single-elimination'
    if ([...results.matches, ...logged].some((existing) => sameMatch(existing, match, bracket))) {
      skipped.push(label)
      continue
    }
    logged.push(match)
  }
  const held: string[] = []
  if (stage.type === 'single-elimination') {
    const placed = placeInBracket(
      seedList,
      stage,
      results.matches.filter((m) => m.stageId === stageId),
      logged,
    )
    logged.splice(0, logged.length, ...placed.logged)
    held.push(...placed.held)
  }
  if (logged.length === 0) return { logged, skipped, held, snapshot: 'not-due' }

  writeJson(resultsPath, EventResults, { ...results, matches: [...results.matches, ...logged] })

  const params = readJson(repoPath('data/model/params.json'), ModelParams)
  const modifiersPath = repoPath('data/model/modifiers.json')
  const modifiers = existsSync(modifiersPath) ? readJson(modifiersPath, Modifiers).modifiers : []
  let ratings = loadRatings()
  for (const match of logged) {
    // Judge the result against the prediction: use the modifiers active on the match day.
    const matchDay = (match.playedAt ?? new Date().toISOString()).slice(0, 10)
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
      activeModifiers(modifiers, matchDay),
    )
  }
  saveRatings(ratings)

  const snapshot = ensureRoundSnapshot(eventId, stageId, announced)

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  appendChangelog(
    `- ${stamp} UTC · ${actor} · logged ${logged.length} result(s) in ${stageId}; ratings updated; snapshot ${snapshot}`,
  )
  return { logged, skipped, held, snapshot }
}

/**
 * Fits new bracket results into their slots before anything is written. Each result takes its slot's
 * round and format from config (a page's own round numbers and map-slot counts depend on how it is
 * edited). A result whose maps don't decide its slot's format (e.g. a Bo5 shown as finished at 2-0)
 * is held back with the results after it, and a result no slot can hold is an error naming the
 * expected first-round pairs. Returned in bracket order (round, then position).
 */
function placeInBracket(
  seeds: readonly string[],
  stage: PlayoffStage,
  existing: readonly MatchResult[],
  incoming: readonly MatchResult[],
): { logged: MatchResult[]; held: string[] } {
  let pending = [...incoming]
  const held: string[] = []
  for (;;) {
    let slots: BracketMatch[]
    try {
      slots = realBracket(seeds, stage, [...existing, ...pending])
    } catch (error) {
      const firstRound = stage.bracket
        .map(([a, b]) => `${seeds[a - 1]} v ${seeds[b - 1]}`)
        .join(', ')
      throw new Error(
        `${String(error)} Expected first-round pairs from our seeding: ${firstRound}.`,
      )
    }
    const placed = pending.map((match) => {
      const slot = slots.find(
        (m) => m.teamA && m.teamB && pair(match) === [m.teamA, m.teamB].sort().join(),
      )
      if (!slot) throw new Error(`${match.id}: no bracket slot`)
      return { match, slot }
    })
    const wrong = placed.find(({ match, slot }) => {
      const won = match.maps.filter((m) =>
        match.winner === match.teamA ? m.scoreA > m.scoreB : m.scoreB > m.scoreA,
      ).length
      return won !== winsNeeded[slot.format]
    })
    if (wrong) {
      const later = placed.filter(
        ({ slot }) => slot.round >= wrong.slot.round && slot !== wrong.slot,
      )
      held.push(
        `${wrong.match.teamA} v ${wrong.match.teamB}: ${wrong.match.maps.length} maps do not decide a ${wrong.slot.format}`,
        ...later
          .filter(({ slot }) => slot.round > wrong.slot.round)
          .map(({ match }) => `${match.teamA} v ${match.teamB}: waits for an earlier match`),
      )
      pending = placed
        .filter(({ slot }) => slot !== wrong.slot && slot.round <= wrong.slot.round)
        .map(({ match }) => match)
      continue
    }
    const logged = placed
      .sort(
        (a, b) =>
          a.slot.round - b.slot.round ||
          Number(a.slot.thirdPlace) - Number(b.slot.thirdPlace) ||
          a.slot.index - b.slot.index,
      )
      .map(({ match, slot }) => ({
        ...match,
        round: slot.round,
        format: slot.format,
        id: `${stage.id}-r${slot.round}-${[match.teamA, match.teamB].sort().join('-')}${slot.thirdPlace ? '-third' : ''}`,
      }))
    return { logged, held }
  }
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
  const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
  if (config.stages.find((s) => s.id === stageId)?.type === 'single-elimination') {
    return ensurePlayoffSnapshot(eventId, stageId)
  }
  const plain = loadStageContext(eventId, stageId)
  const round = currentRound(plain.simInput.seeds, plain.simInput.played, plain.simInput.rules)
  const pairings = announced?.get(round)
  const context = pairings ? loadStageContext(eventId, stageId, { announced: pairings }) : plain
  // One simulation for both the status file and, when due, the snapshot (the chain takes seconds).
  const prediction = predictStage(context.simInput, context.labels, context.chain)
  writeStatus(context, prediction)
  if (round > 5) return 'done'
  if (context.simInput.played.some((m) => m.round === round)) return 'not-due'
  return saveRoundSnapshot(context, prediction).status
}

/** The playoff version: refreshes status.md and saves the pre-round snapshot when one is due. */
function ensurePlayoffSnapshot(eventId: string, stageId: string): LogOutcome['snapshot'] {
  const context = loadPlayoffContext(eventId, stageId)
  const prediction = predictPlayoffs(context.simInput, context.labels)
  writePlayoffStatus(context, prediction)
  if (prediction.currentRound > roundCount(context.stage)) return 'done'
  const started = prediction.sim.bracket.some(
    (m) => m.round === prediction.currentRound && m.winner !== undefined,
  )
  if (started) return 'not-due'
  return savePlayoffSnapshot(context, prediction).status
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
