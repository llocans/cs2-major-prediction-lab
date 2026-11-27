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

/**
 * The model version a stage runs on (`data/model/params.json` or `data/model/archive/<version>.json`)
 * and older versions scored next to it on the same matches. Without it, the latest params.
 */
export const StageModel = z.object({
  version: z.string(),
  alongside: z.array(z.string()).optional(),
})
export type StageModel = z.infer<typeof StageModel>

/**
 * The value-pick rule for a stage's Market odds record (`engine/market-picks.ts`): back the side
 * the model gives at least `minEdge` more than the margin-free market. Stored per stage so a later
 * rule change can never rewrite a finished stage's record; a stage needs one before its first odds
 * are logged (`npm run validate`).
 */
export const MarketRule = z.object({
  minEdge: z.number().min(0).max(0.5),
  /** Skip a match when the model flags little tier-1 data for a team. */
  skipLittleData: z.boolean(),
})
export type MarketRule = z.infer<typeof MarketRule>

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
  model: StageModel.optional(),
  marketRule: MarketRule.optional(),
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
  model: StageModel.optional(),
  marketRule: MarketRule.optional(),
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
  /**
   * Automatic market odds, a benchmark only (never a model input). Closing lines from OddsPapi's free
   * historical-odds endpoint once a match is settled. Absent: no automatic collection.
   */
  marketOdds: z
    .object({
      provider: z.literal('oddspapi'),
      tournamentId: z.number().int().positive(),
      /** Match-winner market id, and its outcome ids for participant1 and participant2 winning. */
      marketId: z.string().min(1),
      outcomes: z.tuple([z.string().min(1), z.string().min(1)]),
      /** Bookmaker slugs to read (the endpoint takes at most 3). */
      bookmakers: z.array(z.string().min(1)).min(1).max(3),
      /** Where the ids above were confirmed (the setup script's API reads). */
      source: Source,
    })
    .optional(),
  /**
   * The in-game Pick'Em format, for the site's Pick'Em page. Swiss stages: how many teams go in the
   * 3-0, advance (3-1 or 3-2) and 0-3 boxes, and how many correct picks pass. Playoffs: one pick per
   * bracket match. Absent: the page shows no pass mark.
   */
  pickem: z
    .object({
      swiss: z.object({
        threeZero: z.number().int().min(0),
        advance: z.number().int().min(0),
        zeroThree: z.number().int().min(0),
        toPass: z.number().int().min(1),
      }),
      source: z.array(Source).min(1),
    })
    .optional(),
})
export type EventConfig = z.infer<typeof EventConfig>
