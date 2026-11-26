import { z } from 'zod'
import { IsoDateTime, Source, TeamId } from './common.ts'

export const DrawPairing = z.object({ teamA: TeamId, teamB: TeamId })

/** One Swiss round's full draw as announced on the stage page (every active team once). */
export const DrawRound = z.object({
  stageId: z.string(),
  round: z.number().int().min(1).max(5),
  pairings: z.array(DrawPairing).min(1),
  /** When the poller first saw the full draw. */
  seenAt: IsoDateTime,
  source: Source,
})
export type DrawRound = z.infer<typeof DrawRound>

/**
 * Announced Swiss draws of an event, one entry per stage and round (round 1 follows from the seeds
 * and is not stored). Written by the poller; read by the site and simulate.ts for the current round.
 */
export const EventDraw = z
  .object({
    schemaVersion: z.literal(1),
    rounds: z.array(DrawRound),
  })
  .refine(
    (d) => new Set(d.rounds.map((r) => `${r.stageId}|${r.round}`)).size === d.rounds.length,
    'one entry per stage and round',
  )
export type EventDraw = z.infer<typeof EventDraw>
