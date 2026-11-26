import { z } from 'zod'
import { IsoDateTime, MapId, MatchFormat, Source, TeamId } from './common.ts'

export const MapResult = z.object({
  map: MapId,
  scoreA: z.number().int().nonnegative(),
  scoreB: z.number().int().nonnegative(),
  pickedBy: z.enum(['A', 'B', 'decider']).optional(),
  /**
   * Regulation rounds won per side (Liquipedia half scores; overtime only in the totals) and the side
   * team A started on. Saved from 2026-11-26; not used by the model yet.
   */
  sides: z
    .object({
      aCt: z.number().int().nonnegative(),
      aT: z.number().int().nonnegative(),
      bCt: z.number().int().nonnegative(),
      bT: z.number().int().nonnegative(),
      aFirstSide: z.enum(['ct', 't']).optional(),
    })
    .optional(),
})
export type MapResult = z.infer<typeof MapResult>

/** A real, finished match. results.json holds nothing else. */
export const MatchResult = z
  .object({
    id: z.string(),
    stageId: z.string(),
    round: z.number().int().min(1),
    teamA: TeamId,
    teamB: TeamId,
    format: MatchFormat,
    maps: z.array(MapResult).min(1),
    winner: TeamId,
    playedAt: IsoDateTime.optional(),
    source: Source,
  })
  .refine((m) => m.winner === m.teamA || m.winner === m.teamB, 'winner must be teamA or teamB')
export type MatchResult = z.infer<typeof MatchResult>

export const EventResults = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  matches: z.array(MatchResult),
})
export type EventResults = z.infer<typeof EventResults>
