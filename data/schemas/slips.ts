import { z } from 'zod'
import { IsoDateTime, TeamId } from './common.ts'

/** One leg of a bet slip: a value pick (`engine/market-picks.ts`). */
export const SlipLeg = z.object({
  teamA: TeamId,
  teamB: TeamId,
  /** The team backed. */
  pick: TeamId,
  /**
   * The chance the slip used for this leg: the model's, or for a Low confidence pick the cautious
   * chance halfway between model and market (`engine/bet-slips.ts`).
   */
  chance: z.number().min(0).max(1),
})
export type SlipLeg = z.infer<typeof SlipLeg>

export const Slip = z.object({
  /** safer: High/Medium picks the model expects to win; riskier: the rest; extra: overflow. */
  kind: z.enum(['safer', 'riskier', 'extra']),
  legs: z.array(SlipLeg).min(1),
})
export type Slip = z.infer<typeof Slip>

/**
 * Bet slips the model built from a round's value picks, one batch per odds reading
 * (`scripts/build-slips.ts`). Frozen once written, like snapshots: a batch is never edited. Odds are
 * not stored here (the bookmaker's decimal odds stay in the git-ignored local file).
 */
export const EventSlips = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  batches: z.array(
    z.object({
      stageId: z.string(),
      round: z.number().int().min(1),
      builtAt: IsoDateTime,
      /** Which odds the value check used: the bookmaker's own, or margin-free. */
      odds: z.enum(['real', 'margin-free']),
      slips: z.array(Slip),
      /** Value picks of the pool left out, and why. */
      left: z.array(SlipLeg.extend({ reason: z.enum(['no-value', 'over-limit']) })),
    }),
  ),
})
export type EventSlips = z.infer<typeof EventSlips>
