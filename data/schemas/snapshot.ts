import { z } from 'zod'
import { IsoDateTime, MatchFormat, Source, TeamId } from './common.ts'

export const Confidence = z.enum(['low', 'medium', 'high'])
export type Confidence = z.infer<typeof Confidence>

export const MatchPrediction = z.object({
  teamA: TeamId,
  teamB: TeamId,
  format: MatchFormat,
  /** Probability that teamA wins. */
  pA: z.number().min(0).max(1),
  confidence: Confidence,
  reason: z.string(),
})
export type MatchPrediction = z.infer<typeof MatchPrediction>

export const TeamOutlook = z.object({
  teamId: TeamId,
  record: z.string(),
  p30: z.number(),
  pAdvance: z.number(),
  p03: z.number(),
  pEliminated: z.number(),
  confidence: Confidence,
  reason: z.string(),
})
export type TeamOutlook = z.infer<typeof TeamOutlook>

/** Saved before each round. Never edited after saving (enforced by a hook). */
export const Snapshot = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  stageId: z.string(),
  beforeRound: z.number().int().min(1),
  createdAt: IsoDateTime,
  modelVersion: z.string(),
  seed: z.number().int(),
  runs: z.number().int().positive(),
  /** Standard error of the least certain probability, in probability units. */
  maxStandardError: z.number(),
  /** Number of real results the snapshot was built on. */
  resultsCount: z.number().int().nonnegative(),
  ratingsAsOf: IsoDateTime,
  matches: z.array(MatchPrediction),
  teams: z.array(TeamOutlook),
})
export type Snapshot = z.infer<typeof Snapshot>

/** Market implied probabilities. A benchmark only, never a model input. */
export const Benchmarks = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  entries: z.array(
    z.object({
      stageId: z.string(),
      round: z.number().int(),
      teamA: TeamId,
      teamB: TeamId,
      /** Implied probability teamA wins, after removing the bookmaker margin. */
      pA: z.number().min(0).max(1),
      source: Source,
      observedAt: IsoDateTime,
    }),
  ),
})
export type Benchmarks = z.infer<typeof Benchmarks>
