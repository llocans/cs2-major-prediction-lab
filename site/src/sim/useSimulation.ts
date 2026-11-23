import { useEffect, useRef, useState } from 'react'
import type { StagePrediction } from '../../../engine/predict.ts'
import type { PlayoffPrediction } from '../../../engine/predict-playoffs.ts'
import { cacheKey, readCached, saveCached } from './cache.ts'
import type {
  AnyPrediction,
  PlayoffSimRequest,
  SimInput,
  SimRequest,
  SimResponse,
  SwissSimRequest,
} from './protocol.ts'

export interface SimState<P> {
  prediction?: P
  /**
   * True while the full run for the latest input is still going. Whatever is on screen meanwhile is
   * the quick first pass or the previous input's result: show it as a rough estimate.
   */
  running: boolean
  final: boolean
  /** The final result came from this browser's cache (identical input, no new run). */
  cached?: boolean
  ms?: number
  error?: string
}

/** A Swiss stage (optionally chained through the rest of the event). */
export function useStageSimulation(
  request: Omit<SwissSimRequest, 'id'> | undefined,
): SimState<StagePrediction> {
  return useSimulation(request, (p) => (p.kind === 'swiss' ? p.value : undefined))
}

/** A Swiss stage with every run's Pick'Em outcomes (set `collectOutcomes` in the request). */
export function useSwissOutcomeSimulation(
  request: Omit<SwissSimRequest, 'id'> | undefined,
): SimState<Extract<AnyPrediction, { kind: 'swiss' }>> {
  return useSimulation(request, (p) => (p.kind === 'swiss' ? p : undefined))
}

/** A single-elimination stage. */
export function usePlayoffSimulation(
  request: Omit<PlayoffSimRequest, 'id'> | undefined,
): SimState<PlayoffPrediction> {
  return useSimulation(request, (p) => (p.kind === 'playoffs' ? p.value : undefined))
}

/**
 * Runs the simulation in a Web Worker. A new input terminates the previous worker, so the UI never
 * waits on stale work. The last prediction stays on screen while re-simulating. A finished result is
 * cached by its input (cache.ts), so an unchanged page shows its final numbers at once.
 */
function useSimulation<P>(
  request: SimInput | undefined,
  pick: (prediction: AnyPrediction) => P | undefined,
): SimState<P> {
  const key = request ? JSON.stringify(request) : ''
  const fromCache = (json: string): SimState<P> | undefined => {
    if (!json) return undefined
    const hit = readCached(cacheKey(json))
    const prediction = hit && pick(hit)
    return prediction ? { prediction, running: false, final: true, cached: true } : undefined
  }
  const [state, setState] = useState<SimState<P>>(
    () => fromCache(key) ?? { running: false, final: false },
  )
  const counter = useRef(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` captures the request by value.
  useEffect(() => {
    if (!request) return
    const cached = fromCache(key)
    if (cached) {
      setState(cached)
      return
    }
    const id = ++counter.current
    const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
    setState((previous) => ({ ...previous, running: true, final: false, cached: false }))
    worker.onmessage = (event: MessageEvent<SimResponse>) => {
      const response = event.data
      if (response.id !== id) return
      if (!response.ok) {
        setState((previous) => ({ ...previous, running: false, error: response.error }))
        worker.terminate()
        return
      }
      setState({
        prediction: pick(response.prediction),
        running: !response.final,
        final: response.final,
        ms: response.ms,
      })
      if (response.final) {
        saveCached(cacheKey(key), response.prediction)
        worker.terminate()
      }
    }
    worker.onerror = (event) => {
      setState((previous) => ({ ...previous, running: false, error: event.message }))
    }
    const message: SimRequest = { ...request, id }
    worker.postMessage(message)
    return () => worker.terminate()
  }, [key])

  return state
}
