import { existsSync } from 'node:fs'
import { Snapshot } from '../../data/schemas/index.ts'
import { roundCount } from '../../engine/playoffs/bracket.ts'
import { realBracket } from '../../engine/playoffs/simulate-playoffs.ts'
import { predictStage, type StagePrediction } from '../../engine/predict.ts'
import {
  currentPlayoffRound,
  type PlayoffPrediction,
  predictPlayoffs,
} from '../../engine/predict-playoffs.ts'
import { currentRound } from '../../engine/simulate-swiss.ts'
import type { PlayoffContext, StageContext } from './event-context.ts'
import { repoPath, writeJson } from './files.ts'

/**
 * snapshots/<stage>-r<round>.json for the stage's own model version; an alongside version's
 * snapshot of the same round goes to snapshots/alongside/<version>/.
 */
export function snapshotPath(
  eventId: string,
  stageId: string,
  round: number,
  alongsideVersion?: string,
): string {
  const file = `${stageId}-r${round}.json`
  return alongsideVersion === undefined
    ? repoPath('data/events', eventId, 'snapshots', file)
    : repoPath('data/events', eventId, 'snapshots', 'alongside', alongsideVersion, file)
}

function contextSnapshotPath(context: StageContext | PlayoffContext, round: number): string {
  const version = context.modelRole === 'alongside' ? context.params.version : undefined
  return snapshotPath(context.eventId, context.stage.id, round, version)
}

/**
 * Saves the pre-round snapshot for the stage's current round. One snapshot per round, never
 * overwritten: returns "exists" if it was already saved, "done" if the stage is over.
 */
export function saveRoundSnapshot(
  context: StageContext,
  /** A prediction already made from this exact context, to avoid simulating twice. */
  existing?: StagePrediction,
  lateSave?: Snapshot['lateSave'],
): {
  status: 'saved' | 'exists' | 'done'
  path?: string
} {
  const { seeds, played, rules } = context.simInput
  const round = currentRound(seeds, played, rules)
  if (round > 5) return { status: 'done' }
  const path = contextSnapshotPath(context, round)
  // Checked before simulating: the whole-event simulation takes seconds and the poller asks often.
  if (existsSync(path)) return { status: 'exists', path }

  // A round that has started already is not "before the round" any more.
  const startedRound = context.simInput.played.some((m) => m.round === round)
  if (startedRound) {
    throw new Error(
      `${context.stage.id} round ${round} already has results; a pre-round snapshot would be dishonest`,
    )
  }
  const prediction = existing ?? predictStage(context.simInput, context.labels, context.chain)
  const maxStandardError = Math.max(
    prediction.sim.maxStandardError,
    prediction.event?.maxStandardError ?? 0,
  )

  writeJson(
    path,
    Snapshot,
    {
      schemaVersion: 1,
      eventId: context.eventId,
      stageId: context.stage.id,
      beforeRound: round,
      createdAt: new Date().toISOString(),
      modelVersion: context.params.version,
      seed: context.simInput.seed,
      runs: context.simInput.runs,
      maxStandardError,
      ...(prediction.event?.unverifiedVeto.length
        ? { unverifiedVeto: prediction.event.unverifiedVeto }
        : {}),
      ...(lateSave ? { lateSave } : {}),
      resultsCount: context.simInput.played.length,
      ratingsAsOf: context.ratingsAsOf,
      matches: prediction.matches,
      teams: prediction.teams,
    },
    { exclusive: true },
  )
  return { status: 'saved', path }
}

/**
 * Saves the pre-round snapshot of a single-elimination stage for its current round (quarterfinals,
 * semifinals, then the final together with the third-place match). Same rules as the Swiss one: once
 * per round, never overwritten, never after the round has a result.
 */
export function savePlayoffSnapshot(
  context: PlayoffContext,
  existing?: PlayoffPrediction,
): { status: 'saved' | 'exists' | 'done'; path?: string } {
  const { seeds, rules, played } = context.simInput
  const bracket = realBracket(seeds, rules, played)
  const rounds = roundCount(rules)
  const round = currentPlayoffRound(bracket, rounds)
  if (round > rounds) return { status: 'done' }
  const path = contextSnapshotPath(context, round)
  if (existsSync(path)) return { status: 'exists', path }

  const roundMatches = bracket.filter((m) => m.round === round)
  if (roundMatches.some((m) => m.winner !== undefined)) {
    throw new Error(
      `${context.stage.id} round ${round} already has results; a pre-round snapshot would be dishonest`,
    )
  }
  const prediction = existing ?? predictPlayoffs(context.simInput, context.labels)
  writeJson(
    path,
    Snapshot,
    {
      schemaVersion: 1,
      eventId: context.eventId,
      stageId: context.stage.id,
      beforeRound: round,
      createdAt: new Date().toISOString(),
      modelVersion: context.params.version,
      seed: context.simInput.seed,
      runs: context.simInput.runs,
      maxStandardError: prediction.sim.maxStandardError,
      ...(prediction.unverifiedVeto.length > 0
        ? { unverifiedVeto: prediction.unverifiedVeto }
        : {}),
      resultsCount: played.length,
      ratingsAsOf: context.ratingsAsOf,
      matches: prediction.matches,
      teams: [],
      playoffTeams: prediction.teams,
    },
    { exclusive: true },
  )
  return { status: 'saved', path }
}
