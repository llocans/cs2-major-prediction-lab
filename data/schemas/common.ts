import { z } from 'zod'

/** Stable team ID. Never changes, even if the organization renames. */
export const TeamId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case team id')
export type TeamId = z.infer<typeof TeamId>

/** Map ID, e.g. "dust2". Display names live in event config. */
export const MapId = z.string().regex(/^[a-z0-9]+$/, 'lowercase map id')
export type MapId = z.infer<typeof MapId>

export const IsoDate = z.iso.date()
export const IsoDateTime = z.iso.datetime({ offset: true })

/** Where a fact or number came from. Required on every derived value. */
export const Source = z.object({
  name: z.string().min(1),
  url: z.url().optional(),
  retrievedAt: IsoDate,
  license: z.string().optional(),
})
export type Source = z.infer<typeof Source>

export const MatchFormat = z.enum(['bo1', 'bo3', 'bo5'])
export type MatchFormat = z.infer<typeof MatchFormat>

export const winsNeeded: Record<MatchFormat, number> = { bo1: 1, bo3: 2, bo5: 3 }
