import { z } from 'zod'
import { IsoDate, Source, TeamId } from './common.ts'

/** A dated roster entry. `to` is absent while the person is still on the team. */
export const RosterEntry = z.object({
  player: z.string(),
  role: z.enum(['player', 'coach', 'stand-in']),
  from: IsoDate,
  to: IsoDate.optional(),
  /** True when the source gives only the month; the date is then the 1st of that month. */
  approximate: z.boolean().optional(),
  source: Source,
})
export type RosterEntry = z.infer<typeof RosterEntry>

/**
 * A team logo: file names on liquipedia.net/commons from Liquipedia's TeamShort team template. The
 * site serves small copies at the paths `teamLogoPaths` gives. `dark` only when the team has a
 * separate dark-theme version. Logos are the teams' trademarks, not CC BY-SA (README).
 */
export const LogoFiles = z.object({
  light: z.string().min(1),
  dark: z.string().min(1).optional(),
  source: Source,
})
export type LogoFiles = z.infer<typeof LogoFiles>

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
  /** Short name (e.g. "NIP"), from Liquipedia's TeamShort team template. Used where space is tight. */
  shortName: z.object({ name: z.string().min(1), source: Source }).optional(),
  /** The team's own logo (Liquipedia's team template without a date). Events can override it. */
  logo: LogoFiles.optional(),
  /** Short team name used in Liquipedia's TeamOpponent template (e.g. "tl" for Liquid). */
  liquipedia: z.string().optional(),
  /** Title of the team's Liquipedia page (MediaWiki API), once resolved. */
  liquipediaPage: z.string().optional(),
  /** Team name as written in Valve's VRS standings files. */
  vrsName: z.string().optional(),
  roster: z.array(RosterEntry).default([]),
})
export type Team = z.infer<typeof Team>

/** Folder (under site/public/) that holds the resized team logos. */
export const LOGO_DIR = 'logos'

/**
 * Where a team's logo files live, relative to site/public/ (and to the built site). An event's own
 * logo for a team (event teams.json) lives in a folder named after the event.
 */
export function teamLogoPaths(
  id: string,
  logo: { dark?: string } | undefined,
  eventId?: string,
): { light: string; dark?: string } | undefined {
  if (!logo) return undefined
  const base = eventId ? `${LOGO_DIR}/${eventId}/${id}` : `${LOGO_DIR}/${id}`
  return { light: `${base}.png`, ...(logo.dark ? { dark: `${base}-dark.png` } : {}) }
}

/** data/teams/registry.json: structured facts. Research notes live in data/teams/<id>.md. */
export const TeamRegistry = z.object({
  schemaVersion: z.literal(1),
  teams: z.array(Team),
})
export type TeamRegistry = z.infer<typeof TeamRegistry>
