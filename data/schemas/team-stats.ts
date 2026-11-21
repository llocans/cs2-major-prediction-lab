import { z } from 'zod'
import { IsoDate, MapId, Source, TeamId } from './common.ts'

const WinLoss = z.object({
  won: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
})

/** data/teams/form/<team-id>.json: recent series results derived from Valve's VRS match tables. */
export const TeamForm = z.object({
  schemaVersion: z.literal(1),
  teamId: TeamId,
  /** Date of the VRS standings the numbers come from. */
  asOf: IsoDate,
  vrs: z.object({ rank: z.number().int().positive(), points: z.number() }),
  /** Roster in the most recent VRS match. */
  roster: z.array(z.string()),
  summary: z.object({
    last90Days: WinLoss,
    vsTop30: WinLoss,
    /** Series vs VRS top-50 teams in the 6-month VRS window. Drives the cold-start rule. */
    tier1Series: z.number().int().nonnegative(),
  }),
  /** Most recent series first (at most 20). */
  recent: z.array(
    z.object({
      date: IsoDate,
      opponent: z.string(),
      opponentRank: z.number().int().positive().optional(),
      result: z.enum(['W', 'L']),
    }),
  ),
  source: Source,
})
export type TeamForm = z.infer<typeof TeamForm>

const MapRecord = z
  .object({ won: z.number().int().nonnegative(), played: z.number().int().nonnegative() })
  .refine((r) => r.won <= r.played, 'won must not exceed played')

/** data/teams/maps/<team-id>.json: map results in a window (from HLTV stats, interactive research). */
export const TeamMapStats = z.object({
  schemaVersion: z.literal(1),
  teamId: TeamId,
  window: z.object({ from: IsoDate, to: IsoDate }),
  /** e.g. "vs HLTV top 50" */
  filter: z.string(),
  overall: MapRecord,
  maps: z.record(MapId, MapRecord),
  source: Source,
})
export type TeamMapStats = z.infer<typeof TeamMapStats>
