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
  /** Reaches the playoffs (whole-event simulation). Absent in snapshots saved before 2026-11-22. */
  pPlayoffs: z.number().optional(),
  /** Wins the event (whole-event simulation). Absent when the playoffs could not be simulated. */
  pTitle: z.number().optional(),
  confidence: Confidence,
  reason: z.string(),
})
export type TeamOutlook = z.infer<typeof TeamOutlook>

/** A team's outlook in a single-elimination stage. */
export const PlayoffTeamOutlook = z.object({
  teamId: TeamId,
  pSemifinal: z.number(),
  pFinal: z.number(),
  pTitle: z.number(),
  /** Absent when the event has no third-place match. */
  pThird: z.number().optional(),
  reason: z.string(),
})
export type PlayoffTeamOutlook = z.infer<typeof PlayoffTeamOutlook>

/**
 * Saved before each round. Never edited after saving (enforced by a hook). Swiss snapshots fill
 * `teams`; playoff snapshots leave it empty and fill `playoffTeams`. `matches` works for both.
 */
export const Snapshot = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  stageId: z.string(),
  beforeRound: z.number().int().min(1),
  createdAt: IsoDateTime,
  modelVersion: z.string(),
  seed: z.number().int(),
  runs: z.number().int().positive(),
  /**
   * Standard error of the least certain probability, in probability units. Covers the stage odds
   * and, in snapshots with pPlayoffs/pTitle (from 2026-11-22), the whole-event odds too.
   */
  maxStandardError: z.number(),
  /** Formats whose veto procedure was assumed, not verified, for the event odds (e.g. ["bo5"]). */
  unverifiedVeto: z.array(MatchFormat).optional(),
  /**
   * Set when a Swiss round's snapshot was saved late: just before its first results were written,
   * because its full draw was never listed earlier. Built on the state before those results (still a
   * pre-round prediction); `draw` says where the pairs came from: "real" (the results' pairs and the
   * page's announced ones made the full draw), "partly-engine" (the engine's pairing filled in teams
   * not yet known), "engine" (the engine's pairing for the whole round).
   */
  lateSave: z.object({ draw: z.enum(['real', 'partly-engine', 'engine']) }).optional(),
  /** Number of real results the snapshot was built on. */
  resultsCount: z.number().int().nonnegative(),
  ratingsAsOf: IsoDateTime,
  matches: z.array(MatchPrediction),
  teams: z.array(TeamOutlook),
  playoffTeams: z.array(PlayoffTeamOutlook).optional(),
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
