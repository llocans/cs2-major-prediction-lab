import type { MapId } from '../data/schemas/common.ts'
import type { VetoStep } from '../data/schemas/event-config.ts'
import type { Rng } from './rng.ts'

/** How much a side likes a map: its strength advantage there, in rating points. */
export type Advantage = (side: 'A' | 'B', map: MapId) => number

/**
 * Runs a veto and returns the maps in play order: picks in pick order, then the decider.
 * Bans remove a low-advantage map and picks take a high-advantage one, by softmax with `temperature`
 * (rating points). Temperature 0, or no rng, is fully greedy and deterministic.
 */
export function runVeto(
  steps: readonly VetoStep[],
  pool: readonly MapId[],
  advantage: Advantage,
  temperature: number,
  rng?: Rng,
): MapId[] {
  const remaining = [...pool]
  const picked: MapId[] = []
  for (const step of steps) {
    for (let i = 0; i < step.count; i++) {
      if (remaining.length <= 1) throw new Error('Veto removed every map; check the veto steps')
      const sign = step.action === 'pick' ? 1 : -1
      const scores = remaining.map((map) => sign * advantage(step.team, map))
      const index = choose(scores, temperature, rng)
      const [map] = remaining.splice(index, 1)
      if (map !== undefined && step.action === 'pick') picked.push(map)
    }
  }
  const decider = remaining[0]
  if (remaining.length !== 1 || decider === undefined) {
    throw new Error(`Veto must leave exactly one decider map, left ${remaining.length}`)
  }
  return [...picked, decider]
}

/** Index of the best score, or a softmax draw when temperature > 0 and an rng is given. */
function choose(scores: readonly number[], temperature: number, rng?: Rng): number {
  if (temperature <= 0 || !rng) {
    let best = 0
    scores.forEach((score, index) => {
      if (score > (scores[best] ?? Number.NEGATIVE_INFINITY)) best = index
    })
    return best
  }
  const max = Math.max(...scores)
  const weights = scores.map((score) => Math.exp((score - max) / temperature))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let draw = rng.next() * total
  for (let index = 0; index < weights.length; index++) {
    draw -= weights[index] ?? 0
    if (draw <= 0) return index
  }
  return weights.length - 1
}
