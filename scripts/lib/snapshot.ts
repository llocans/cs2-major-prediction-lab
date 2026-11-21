import { existsSync } from 'node:fs'
import { Snapshot } from '../../data/schemas/index.ts'
import { predictStage } from '../../engine/predict.ts'
import type { StageContext } from './event-context.ts'
import { repoPath, writeJson } from './files.ts'

export function snapshotPath(eventId: string, stageId: string, round: number): string {
  return repoPath('data/events', eventId, 'snapshots', `${stageId}-r${round}.json`)
}

/**
 * Saves the pre-round snapshot for the stage's current round. One snapshot per round, never
 * overwritten: returns "exists" if it was already saved, "done" if the stage is over.
 */
export function saveRoundSnapshot(context: StageContext): {
  status: 'saved' | 'exists' | 'done'
  path?: string
} {
  const prediction = predictStage(context.simInput, context.labels)
  const round = prediction.sim.currentRound
  if (round > 5) return { status: 'done' }
  const path = snapshotPath(context.eventId, context.stage.id, round)
  if (existsSync(path)) return { status: 'exists', path }

  // A round that has started already is not "before the round" any more.
  const startedRound = context.simInput.played.some((m) => m.round === round)
  if (startedRound) {
    throw new Error(
      `${context.stage.id} round ${round} already has results; a pre-round snapshot would be dishonest`,
    )
  }

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
      resultsCount: context.simInput.played.length,
      ratingsAsOf: context.ratingsAsOf,
      matches: prediction.matches,
      teams: prediction.teams,
    },
    { exclusive: true },
  )
  return { status: 'saved', path }
}
