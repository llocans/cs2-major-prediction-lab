import { z } from 'zod'
import { IsoDate, MapId, MatchFormat, Source } from './common.ts'

/** One step of a map veto. The remaining map after all steps is the decider. */
export const VetoStep = z.object({
  team: z.enum(['A', 'B']),
  action: z.enum(['ban', 'pick']),
  /** How many maps this step removes or picks. */
  count: z.number().int().min(1).default(1),
})
export type VetoStep = z.infer<typeof VetoStep>

export const VetoProcedure = z.object({
  steps: z.array(VetoStep).min(1),
  source: Source,
  /** Set when the procedure is not yet confirmed by an official source. */
  unverified: z.boolean().optional(),
})
export type VetoProcedure = z.infer<typeof VetoProcedure>

/** Which Bo a Swiss match uses. "decider" = an elimination or advancement match. */
export const SwissFormatRule = z.object({
  default: MatchFormat,
  decider: MatchFormat,
})
export type SwissFormatRule = z.infer<typeof SwissFormatRule>

export const SwissStage = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal('swiss'),
  start: IsoDate,
  end: IsoDate,
  teamCount: z.literal(16),
  winsToAdvance: z.number().int().min(1),
  lossesToEliminate: z.number().int().min(1),
  format: SwissFormatRule,
  /** Round 1 pairs by initial seed. Pairs of 1-based seeds. */
  initialPairing: z.array(z.tuple([z.number().int(), z.number().int()])),
  /** Name of the pairing rule set implemented in engine/swiss/pairing.ts. */
  pairingRules: z.literal('valve-major-2025'),
  /** Known round dates. May be incomplete until the organizer publishes the schedule. */
  rounds: z.array(z.object({ round: z.number().int().min(1), date: IsoDate })),
  /** Liquipedia page holding this stage's matches (MediaWiki API title). */
  liquipediaPage: z.string().optional(),
  /** Seeds 1..8 for invited teams come from pre-event seeding; advancing teams fill the rest. */
  advanceTo: z.string().optional(),
  source: z.array(Source).min(1),
})
export type SwissStage = z.infer<typeof SwissStage>

export const PlayoffStage = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal('single-elimination'),
  start: IsoDate,
  end: IsoDate,
  /** Quarterfinal pairs by final seed of the previous stage. */
  bracket: z.array(z.tuple([z.number().int(), z.number().int()])),
  format: z.object({
    default: MatchFormat,
    final: MatchFormat,
    thirdPlace: MatchFormat.optional(),
  }),
  thirdPlaceDecider: z.boolean(),
  /** Liquipedia page holding the bracket (MediaWiki API title). */
  liquipediaPage: z.string().optional(),
  source: z.array(Source).min(1),
})
export type PlayoffStage = z.infer<typeof PlayoffStage>

export const Stage = z.discriminatedUnion('type', [SwissStage, PlayoffStage])
export type Stage = z.infer<typeof Stage>

export const EventConfig = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  organizer: z.string(),
  timezone: z.string(),
  mapPool: z.array(z.object({ id: MapId, name: z.string() })).length(7),
  mapPoolSource: z.array(Source).min(1),
  veto: z.object({
    bo1: VetoProcedure,
    bo3: VetoProcedure,
    bo5: VetoProcedure.optional(),
  }),
  stages: z.array(Stage).min(1),
})
export type EventConfig = z.infer<typeof EventConfig>
