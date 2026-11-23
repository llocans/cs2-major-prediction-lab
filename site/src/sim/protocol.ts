import type { VetoProcedure } from '../../../data/schemas/event-config.ts'
import type { ModelParams, Modifier, Ratings } from '../../../data/schemas/model.ts'
import type { SwissOutcomes } from '../../../engine/pickem.ts'
import type { PlayoffResult, PlayoffRules } from '../../../engine/playoffs/bracket.ts'
import type { StagePrediction } from '../../../engine/predict.ts'
import type { PlayoffPrediction } from '../../../engine/predict-playoffs.ts'
import type { EventChain } from '../../../engine/simulate-event.ts'
import type { SwissFormat } from '../../../engine/swiss/format.ts'
import type { SwissMatch, SwissRules } from '../../../engine/swiss/types.ts'

/** What every simulation needs to rebuild the model inside the worker. Plain data only. */
interface ModelRequest {
  id: number
  runs: number
  seed: number
  ratings: Ratings
  modifiers: Modifier[]
  params: ModelParams
  mapPool: string[]
  veto: { bo1?: VetoProcedure; bo3?: VetoProcedure; bo5?: VetoProcedure }
  today: string
  teamNames: Record<string, string>
  mapNames: Record<string, string>
}

export interface SwissSimRequest extends ModelRequest {
  kind: 'swiss'
  seeds: string[]
  rules: SwissRules
  format: SwissFormat
  played: SwissMatch[]
  /** The rest of the event, for playoff and title odds (whole-event simulation). */
  chain?: EventChain
  /** Also return every run's Pick'Em outcomes (for the chance that picks pass). */
  collectOutcomes?: boolean
}

export interface PlayoffSimRequest extends ModelRequest {
  kind: 'playoffs'
  seeds: string[]
  rules: PlayoffRules
  played: PlayoffResult[]
}

export type SimRequest = SwissSimRequest | PlayoffSimRequest

/** A request before the hook gives it an id (Omit applied to each member of the union). */
export type SimInput = SimRequest extends infer R
  ? R extends SimRequest
    ? Omit<R, 'id'>
    : never
  : never

export type AnyPrediction =
  | { kind: 'swiss'; value: StagePrediction; outcomes?: SwissOutcomes }
  | { kind: 'playoffs'; value: PlayoffPrediction }

export type SimResponse =
  | { id: number; ok: true; final: boolean; prediction: AnyPrediction; ms: number }
  | { id: number; ok: false; error: string }
