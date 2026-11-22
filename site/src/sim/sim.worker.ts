import { buildMatchModel } from '../../../engine/match-model.ts'
import { predictStage } from '../../../engine/predict.ts'
import type { SimRequest, SimResponse } from './protocol.ts'

/** The slice of the worker global scope we use (the DOM and webworker libs can't be combined). */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SimRequest>) => void) | null
  postMessage(message: SimResponse): void
}

/** Quick first pass so the UI updates fast, then the full run. */
const PREVIEW_RUNS = 1500

scope.onmessage = (event: MessageEvent<SimRequest>) => {
  const request = event.data
  try {
    const model = buildMatchModel(
      request.ratings,
      request.modifiers,
      request.params,
      request.mapPool,
      request.today,
    )
    const labels = {
      team: (id: string) => request.teamNames[id] ?? id,
      map: (id: string) => request.mapNames[id] ?? id,
    }
    const base = {
      seeds: request.seeds,
      rules: request.rules,
      format: request.format,
      veto: request.veto,
      model,
      played: request.played,
      seed: request.seed,
    }
    for (const [runs, final] of [
      [Math.min(PREVIEW_RUNS, request.runs), false],
      [request.runs, true],
    ] as const) {
      const started = performance.now()
      const prediction = predictStage({ ...base, runs }, labels, request.chain)
      const response: SimResponse = {
        id: request.id,
        ok: true,
        final,
        prediction,
        ms: Math.round(performance.now() - started),
      }
      scope.postMessage(response)
    }
  } catch (error) {
    const response: SimResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    scope.postMessage(response)
  }
}
