import { useEffect, useRef, useState } from 'react'
import type { StagePrediction } from '../../../engine/predict.ts'
import type { SimRequest, SimResponse } from './protocol.ts'

export interface SimState {
  prediction?: StagePrediction
  /** True while the full run for the latest input is still going. */
  running: boolean
  final: boolean
  ms?: number
  error?: string
}

/**
 * Runs the simulation in a Web Worker. A new input terminates the previous worker, so the UI never
 * waits on stale work. The last prediction stays on screen while re-simulating.
 */
export function useSimulation(request: Omit<SimRequest, 'id'> | undefined): SimState {
  const [state, setState] = useState<SimState>({ running: false, final: false })
  const counter = useRef(0)
  const key = request ? JSON.stringify(request) : ''

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` captures the request by value.
  useEffect(() => {
    if (!request) return
    const id = ++counter.current
    const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
    setState((previous) => ({ ...previous, running: true, final: false }))
    worker.onmessage = (event: MessageEvent<SimResponse>) => {
      const response = event.data
      if (response.id !== id) return
      if (!response.ok) {
        setState((previous) => ({ ...previous, running: false, error: response.error }))
        worker.terminate()
        return
      }
      setState({
        prediction: response.prediction,
        running: !response.final,
        final: response.final,
        ms: response.ms,
      })
      if (response.final) worker.terminate()
    }
    worker.onerror = (event) => {
      setState((previous) => ({ ...previous, running: false, error: event.message }))
    }
    worker.postMessage({ ...request, id } satisfies SimRequest)
    return () => worker.terminate()
  }, [key])

  return state
}
