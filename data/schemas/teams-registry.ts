import { z } from 'zod'
import { IsoDate, Source, TeamId } from './common.ts'

/** A dated roster entry. `to` is absent while the person is still on the team. */
export const RosterEntry = z.object({
  player: z.string(),
  role: z.enum(['player', 'coach', 'stand-in']),
  from: IsoDate,
  to: IsoDate.optional(),
  source: Source,
})
export type RosterEntry = z.infer<typeof RosterEntry>

export const TeamAlias = z.object({
  name: z.string(),
  /** e.g. "pgl-major-singapore-2026" when the alias applies to one event only. */
  context: z.string().optional(),
})

export const Team = z.object({
  id: TeamId,
  name: z.string(),
  region: z.enum(['europe', 'americas', 'asia']).optional(),
  aliases: z.array(TeamAlias).default([]),
  /** Short team name used in Liquipedia's TeamOpponent template (e.g. "tl" for Liquid). */
  liquipedia: z.string().optional(),
  /** Team name as written in Valve's VRS standings files. */
  vrsName: z.string().optional(),
  roster: z.array(RosterEntry).default([]),
})
export type Team = z.infer<typeof Team>

/** data/teams/registry.json: structured facts. Research notes live in data/teams/<id>.md. */
export const TeamRegistry = z.object({
  schemaVersion: z.literal(1),
  teams: z.array(Team),
})
export type TeamRegistry = z.infer<typeof TeamRegistry>
