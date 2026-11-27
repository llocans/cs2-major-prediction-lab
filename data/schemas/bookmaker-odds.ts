import { z } from 'zod'
import { IsoDateTime, Source, TeamId } from './common.ts'

/**
 * One bookmaker's match-winner prices, read by hand before a round (`scripts/log-odds.ts`), for the
 * Market odds page. This committed file holds only the margin-free probability; the decimal odds
 * stay in the git-ignored `LocalMarketOdds` file (`docs/sources.md`). A benchmark only, never a model
 * input.
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
      /** The match's kickoff as the bookmaker listed it; odds read after it are never used for slips. */
      startsAt: IsoDateTime.optional(),
    }),
  ),
})
export type BookmakerOdds = z.infer<typeof BookmakerOdds>

/**
 * The bookmaker's own decimal odds, as read (`scripts/log-odds.ts`), for real payouts on bet slips.
 * Lives in `data/events/<id>/local/market-odds.json`, which is git-ignored: kept on this Mac only,
 * never committed or published (`docs/sources.md`).
 */
export const LocalMarketOdds = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  entries: z.array(
    z.object({
      stageId: z.string(),
      round: z.number().int().min(1),
      teamA: TeamId,
      teamB: TeamId,
      oddsA: z.number().gt(1),
      oddsB: z.number().gt(1),
      /** The day the odds were read. */
      retrievedAt: z.string(),
      /** When the odds were read, if known to the minute. */
      observedAt: IsoDateTime.optional(),
    }),
  ),
})
export type LocalMarketOdds = z.infer<typeof LocalMarketOdds>
