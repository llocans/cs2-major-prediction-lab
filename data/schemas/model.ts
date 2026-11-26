import { z } from 'zod'
import { IsoDate, IsoDateTime, MapId, Source, TeamId } from './common.ts'

export const MapStrength = z.object({
  /** Offset from the team's overall rating, in rating points. */
  offset: z.number(),
  /** Uncertainty of the offset. */
  rd: z.number().positive(),
  /** Maps played in the sample. */
  n: z.number().int().nonnegative(),
})
export type MapStrength = z.infer<typeof MapStrength>

export const TeamRating = z.object({
  rating: z.number(),
  rd: z.number().positive(),
  maps: z.record(MapId, MapStrength),
  sources: z.array(Source).min(1),
})
export type TeamRating = z.infer<typeof TeamRating>

/** data/ratings/current.json and data/ratings/history/<timestamp>.json */
export const Ratings = z.object({
  schemaVersion: z.literal(1),
  asOf: IsoDateTime,
  /** Short description of what produced this file, e.g. "prior" or "log-result m-12". */
  reason: z.string(),
  teams: z.record(TeamId, TeamRating),
})
export type Ratings = z.infer<typeof Ratings>

/** data/model/params.json */
export const ModelParams = z.object({
  schemaVersion: z.literal(1),
  version: z.string(),
  /** Rating points per factor of 10 in win odds (logistic scale). */
  scale: z.number().positive(),
  prior: z.object({
    /** rating = base + perVrsPoint * (vrsPoints - vrsCenter) */
    base: z.number(),
    vrsCenter: z.number(),
    perVrsPoint: z.number(),
    rd: z.number().positive(),
    coldStartRd: z.number().positive(),
    /** Teams with fewer series than this vs VRS top-50 teams in the last 6 months get coldStartRd. */
    coldStartSeries: z.number().int().nonnegative(),
  }),
  maps: z.object({
    /** Pseudo-count of maps pulling a map offset toward 0 (the overall rating). */
    shrinkMaps: z.number().positive(),
    maxOffset: z.number().positive(),
    newMapRd: z.number().positive(),
    /** A map a team did not play at all in at least `unplayedMinMaps` maps is treated as its ban. */
    unplayedPenalty: z.number().nonnegative(),
    unplayedMinMaps: z.number().int().positive(),
  }),
  update: z.object({
    /** Base step per map, scaled by format weight and round difference. */
    k: z.number().positive(),
    formatWeight: z.object({ bo1: z.number(), bo3: z.number(), bo5: z.number() }),
    roundDiffWeight: z.number().nonnegative(),
    minRd: z.number().positive(),
  }),
  veto: z.object({
    /** Softmax temperature (rating points) for picks and bans. 0 = always greedy. */
    temperature: z.number().nonnegative(),
    /**
     * Teams' real ban and pick habits (data/teams/vetoes/, since v0.2.0). Each veto step mixes the
     * strength-based choice with the team's HLTV share for that action, counted
     * weight × n / (n + shrinkMaps) for a team with n maps. Absent: strength alone (v0.1.0).
     */
    habits: z
      .object({
        weight: z.number().min(0).max(1),
        shrinkMaps: z.number().positive(),
      })
      .optional(),
  }),
  sim: z.object({ runs: z.number().int().positive(), seed: z.number().int() }),
  modifiers: z.object({ maxAbs: z.number().positive() }),
  /** Max change of any weight per stage review (see docs/model.md). */
  retuneCapPerStage: z.number().positive(),
})
export type ModelParams = z.infer<typeof ModelParams>

/** A logged, capped, expiring judgment call. The only way research enters the model. */
export const Modifier = z.object({
  id: z.string(),
  teamId: TeamId,
  map: MapId.optional(),
  /** Rating points. Clamped to params.modifiers.maxAbs by the engine. */
  delta: z.number(),
  reason: z.string().min(10),
  source: Source,
  createdAt: IsoDate,
  expires: IsoDate,
})
export type Modifier = z.infer<typeof Modifier>

export const Modifiers = z.object({
  schemaVersion: z.literal(1),
  modifiers: z.array(Modifier),
})
export type Modifiers = z.infer<typeof Modifiers>
