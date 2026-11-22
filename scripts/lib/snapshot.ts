import { existsSync } from 'node:fs'
import { Snapshot } from '../../data/schemas/index.ts'
import { predictStage, type StagePrediction } from '../../engine/predict.ts'
import { currentRound } from '../../engine/simulate-swiss.ts'
import type { StageContext } from './event-context.ts'
import { repoPath, writeJson } from './files.ts'

export function snapshotPath(eventId: string, stageId: string, round: number): string {
  return repoPath('data/events', eventId, 'snapshots', `${stageId}-r${round}.json`)
}

/**
 * Saves the pre-round snapshot for the stage's current round. One snapshot per round, never
 * overwritten: returns "exists" if it was already saved, "done" if the stage is over.
 */
export function saveRoundSnapshot(
  context: StageContext,
  /** A prediction already made from this exact context, to avoid simulating twice. */
  existing?: StagePrediction,
): {
  status: 'saved' | 'exists' | 'done'
  path?: string
} {
  const { seeds, played, rules } = context.simInput
  const round = currentRound(seeds, played, rules)
  if (round > 5) return { status: 'done' }
  const path = snapshotPath(context.eventId, context.stage.id, round)
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
      resultsCount: context.simInput.played.length,
      ratingsAsOf: context.ratingsAsOf,
      matches: prediction.matches,
      teams: prediction.teams,
    },
    { exclusive: true },
  )
  return { status: 'saved', path }
}
