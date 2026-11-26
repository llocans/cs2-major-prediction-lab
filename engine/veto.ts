import type { MapId } from '../data/schemas/common.ts'
import type { VetoStep } from '../data/schemas/event-config.ts'
import type { Rng } from './rng.ts'

/** How much a side likes a map: its strength advantage there, in rating points. */
export type Advantage = (side: 'A' | 'B', map: MapId) => number

/**
 * A side's real habit for one veto action over the remaining maps: a share per map (any scale) and
 * how much it counts (0-1). Undefined when the side has no habit data: strength alone decides.
 */
export type VetoHabit = (
  side: 'A' | 'B',
  action: 'ban' | 'pick',
  remaining: readonly MapId[],
) => { shares: number[]; weight: number } | undefined

/**
 * Runs a veto and returns the maps in play order: picks in pick order, then the decider.
 * Bans remove a low-advantage map and picks take a high-advantage one, by softmax with `temperature`
 * (rating points), mixed with each side's real `habit` when given. No rng is fully greedy and
 * deterministic (the most likely map each step); temperature 0 is greedy on strength only.
 */
export function runVeto(
  steps: readonly VetoStep[],
  pool: readonly MapId[],
  advantage: Advantage,
  temperature: number,
  rng?: Rng,
  habit?: VetoHabit,
): MapId[] {
  const remaining = [...pool]
  const picked: MapId[] = []
  for (const step of steps) {
    for (let i = 0; i < step.count; i++) {
      if (remaining.length <= 1) throw new Error('Veto removed every map; check the veto steps')
      const sign = step.action === 'pick' ? 1 : -1
      const scores = remaining.map((map) => sign * advantage(step.team, map))
      const mix = habit?.(step.team, step.action, remaining)
      const index = mix
        ? chooseMixed(scores, temperature, mix, rng)
        : choose(scores, temperature, rng)
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

/** Like `choose`, with a habit mixed in (`mixedWeights`); greedy takes the most likely map. */
function chooseMixed(
  scores: readonly number[],
  temperature: number,
  mix: { shares: number[]; weight: number },
  rng?: Rng,
): number {
  const weights = mixedWeights(scores, temperature, mix)
  if (!rng) {
    let best = 0
    weights.forEach(([, w], index) => {
      if (w > (weights[best]?.[1] ?? Number.NEGATIVE_INFINITY)) best = index
    })
    return best
  }
  let draw = rng.next()
  for (const [index, weight] of weights) {
    draw -= weight
    if (draw <= 0) return index
  }
  return scores.length - 1
}

/**
 * The chance of each remaining map at one veto step with a habit: (1 - weight) × the strength-based
 * chance (`choiceWeights`) + weight × the map's share of the habit. Habit shares summing to 0 give
 * the strength-based chances alone.
 */
function mixedWeights(
  scores: readonly number[],
  temperature: number,
  mix: { shares: number[]; weight: number },
): Array<[number, number]> {
  const strength = new Map(choiceWeights(scores, temperature))
  const total = mix.shares.reduce((sum, share) => sum + share, 0)
  const weight = total > 0 ? mix.weight : 0
  return scores.map((_, index) => [
    index,
    (1 - weight) * (strength.get(index) ?? 0) + weight * ((mix.shares[index] ?? 0) / (total || 1)),
  ])
}

/** One possible veto result: the maps in play order and its probability. */
export interface VetoOutcome {
  maps: MapId[]
  p: number
}

/**
 * Every veto `runVeto` can produce with an rng, with its exact probability: each step takes a map
 * with the same softmax weights `runVeto` draws from. Temperature 0 gives the greedy veto alone. Used
 * for exact match odds, so they carry no Monte Carlo noise and do not depend on match order.
 */
export function vetoOutcomes(
  steps: readonly VetoStep[],
  pool: readonly MapId[],
  advantage: Advantage,
  temperature: number,
  habit?: VetoHabit,
): VetoOutcome[] {
  const actions = steps.flatMap((step) =>
    Array.from({ length: step.count }, () => ({ team: step.team, action: step.action })),
  )
  const outcomes: VetoOutcome[] = []
  const walk = (
    index: number,
    remaining: readonly MapId[],
    picked: readonly MapId[],
    p: number,
  ) => {
    const step = actions[index]
    if (!step) {
      const decider = remaining[0]
      if (remaining.length !== 1 || decider === undefined) {
        throw new Error(`Veto must leave exactly one decider map, left ${remaining.length}`)
      }
      outcomes.push({ maps: [...picked, decider], p })
      return
    }
    if (remaining.length <= 1) throw new Error('Veto removed every map; check the veto steps')
    const sign = step.action === 'pick' ? 1 : -1
    const scores = remaining.map((map) => sign * advantage(step.team, map))
    const mix = habit?.(step.team, step.action, remaining)
    const weights = mix
      ? mixedWeights(scores, temperature, mix)
      : choiceWeights(scores, temperature)
    for (const [choice, weight] of weights) {
      if (mix && weight <= 0) continue
      const map = remaining[choice]
      if (map === undefined) continue
      walk(
        index + 1,
        remaining.filter((_, i) => i !== choice),
        step.action === 'pick' ? [...picked, map] : picked,
        p * weight,
      )
    }
  }
  walk(0, pool, [], 1)
  return outcomes
}

/** The probability of each index `choose` can return: the greedy one, or the softmax weights. */
function choiceWeights(scores: readonly number[], temperature: number): Array<[number, number]> {
  if (temperature <= 0) {
    let best = 0
    scores.forEach((score, index) => {
      if (score > (scores[best] ?? Number.NEGATIVE_INFINITY)) best = index
    })
    return [[best, 1]]
  }
  const max = Math.max(...scores)
  const weights = scores.map((score) => Math.exp((score - max) / temperature))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  return weights.map((weight, index) => [index, weight / total])
}
