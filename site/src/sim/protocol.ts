import type { VetoProcedure } from '../../../data/schemas/event-config.ts'
import type { ModelParams, Modifier, Ratings } from '../../../data/schemas/model.ts'
import type { StagePrediction } from '../../../engine/predict.ts'
import type { SwissFormat } from '../../../engine/swiss/format.ts'
import type { SwissMatch, SwissRules } from '../../../engine/swiss/types.ts'

/** Everything the worker needs. Plain data only: the model is rebuilt inside the worker. */
export interface SimRequest {
  id: number
  runs: number
  seed: number
  ratings: Ratings
  modifiers: Modifier[]
  params: ModelParams
  mapPool: string[]
  veto: { bo1?: VetoProcedure; bo3?: VetoProcedure; bo5?: VetoProcedure }
  seeds: string[]
  rules: SwissRules
  format: SwissFormat
  played: SwissMatch[]
  today: string
  teamNames: Record<string, string>
  mapNames: Record<string, string>
}

export type SimResponse =
  | { id: number; ok: true; final: boolean; prediction: StagePrediction; ms: number }
  | { id: number; ok: false; error: string }
