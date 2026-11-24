import { z } from 'zod'
import { IsoDateTime, Source, TeamId } from './common.ts'

/**
 * One bookmaker's match-winner prices, read by hand before a round (`scripts/log-odds.ts`), for the
 * Market odds page. Only the margin-free probability is stored, never the bookmaker's decimal odds
 * (`docs/sources.md`). A benchmark only, never a model input.
 */
export const BookmakerOdds = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  entries: z.array(
    z.object({
      stageId: z.string(),
      round: z.number().int().min(1),
      teamA: TeamId,
      teamB: TeamId,
      /** Probability teamA wins, after removing the bookmaker margin. */
      pA: z.number().min(0).max(1),
      source: Source,
      /** When the odds were read, if known to the minute. */
      observedAt: IsoDateTime.optional(),
    }),
  ),
})
export type BookmakerOdds = z.infer<typeof BookmakerOdds>
