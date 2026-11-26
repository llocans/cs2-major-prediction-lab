import { buildMatchModel } from '../../../engine/match-model.ts'
import { outcomeCollector } from '../../../engine/pickem.ts'
import { predictStage } from '../../../engine/predict.ts'
import { predictPlayoffs } from '../../../engine/predict-playoffs.ts'
import type { AnyPrediction, SimRequest, SimResponse } from './protocol.ts'

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
      request.vetoStats,
    )
    const labels = {
      team: (id: string) => request.teamNames[id] ?? id,
      map: (id: string) => request.mapNames[id] ?? id,
    }
    const predict = (runs: number): AnyPrediction => {
      const common = { veto: request.veto, model, seed: request.seed, runs }
      if (request.kind === 'playoffs') {
        const input = {
          ...common,
          seeds: request.seeds,
          rules: request.rules,
          played: request.played,
        }
        return { kind: 'playoffs', value: predictPlayoffs(input, labels) }
      }
      const input = {
        ...common,
        seeds: request.seeds,
        rules: request.rules,
        format: request.format,
        played: request.played,
      }
      if (!request.collectOutcomes) {
        return { kind: 'swiss', value: predictStage(input, labels, request.chain) }
      }
      const collect = outcomeCollector(request.seeds, request.rules, runs)
      const value = predictStage(input, labels, request.chain, collect.add)
      return { kind: 'swiss', value, outcomes: collect.result() }
    }
    for (const [runs, final] of [
      [Math.min(PREVIEW_RUNS, request.runs), false],
      [request.runs, true],
    ] as const) {
      const started = performance.now()
      const prediction = predict(runs)
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
