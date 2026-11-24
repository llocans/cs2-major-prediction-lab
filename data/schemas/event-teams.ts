import { z } from 'zod'
import { Source, TeamId } from './common.ts'

export const EventParticipant = z.object({
  teamId: TeamId,
  /** Name used by the organizer at this event (e.g. "GOSH" for BC.Game). */
  displayName: z.string(),
  /**
   * Short name at this event, only when the team plays under another name than its usual one
   * (e.g. "GOSH" for BC.Game). Otherwise the registry's short name is used. Sourced, like
   * `displayName`, by the file's `source` list.
   */
  shortName: z.string().optional(),
  /** Stage the team enters in. */
  entryStage: z.string(),
  /** Seed within the entry stage (1-16). */
  stageSeed: z.number().int().min(1).max(16),
  /**
   * Seeds in later stages the team reached by advancing, e.g. { "stage-2": 11 }. Written by
   * scripts/lib/advance.ts from the previous stage's final standings (Valve mid-stage seeding).
   */
  advancedSeeds: z.record(z.string(), z.number().int().min(1).max(16)).optional(),
  /** VRS points at the invite cutoff, used as the rating prior. */
  vrsPoints: z.number().nonnegative().optional(),
})
export type EventParticipant = z.infer<typeof EventParticipant>

export const EventTeams = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  participants: z.array(EventParticipant).min(1),
  source: z.array(Source).min(1),
})
export type EventTeams = z.infer<typeof EventTeams>
