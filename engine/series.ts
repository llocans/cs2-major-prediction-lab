import type { MapId, MatchFormat } from '../data/schemas/common.ts'
import { winsNeeded } from '../data/schemas/common.ts'
import type { VetoProcedure } from '../data/schemas/event-config.ts'
import type { MatchModel } from './match-model.ts'
import type { Rng } from './rng.ts'
import { type Advantage, runVeto, type VetoHabit, vetoOutcomes } from './veto.ts'

export type VetoRules = Partial<Record<MatchFormat, VetoProcedure>>

export interface SeriesResult {
  winner: string
  maps: Array<{ map: MapId; winner: string }>
}

/** Probability of winning a series given the per-map win probabilities in play order. */
export function seriesWinProbability(
  mapProbabilities: readonly number[],
  format: MatchFormat,
): number {
  const needed = winsNeeded[format]
  // Walk every win/loss path until one side reaches the wins needed.
  let total = 0
  const walk = (index: number, wins: number, losses: number, p: number) => {
    if (wins === needed) {
      total += p
      return
    }
    if (losses === needed) return
    const q = mapProbabilities[index]
    if (q === undefined) throw new Error(`Not enough maps for a ${format}`)
    walk(index + 1, wins + 1, losses, p * q)
    walk(index + 1, wins, losses + 1, p * (1 - q))
  }
  walk(0, 0, 0, 1)
  return total
}

function procedureFor(format: MatchFormat, veto: VetoRules): VetoProcedure {
  const procedure = veto[format]
  if (!procedure) throw new Error(`No veto procedure for ${format} in event config`)
  return procedure
}

/** How much each veto side likes a map, with `first` as Team A. */
function vetoAdvantage(first: string, second: string, model: MatchModel): Advantage {
  const sides = { A: first, B: second } as const
  return (side, map) => {
    const me = sides[side]
    const them = side === 'A' ? second : first
    return model.strength(me, map) - model.strength(them, map)
  }
}

/** Each veto side's real habits, with `first` as Team A (undefined: strength alone). */
function vetoHabit(first: string, second: string, model: MatchModel): VetoHabit {
  return (side, action, remaining) =>
    model.vetoHabit(side === 'A' ? first : second, action, remaining)
}

/** The maps a veto produces, with `first` as Team A. */
function vetoMaps(
  first: string,
  second: string,
  format: MatchFormat,
  model: MatchModel,
  veto: VetoRules,
  rng?: Rng,
): MapId[] {
  const advantage = vetoAdvantage(first, second, model)
  return runVeto(
    procedureFor(format, veto).steps,
    model.mapPool,
    advantage,
    model.vetoTemperature,
    rng,
    vetoHabit(first, second, model),
  )
}

/**
 * The higher seed chooses to be Team A or Team B. It takes the role whose greedy veto gives it the
 * better series win probability. Returns [teamA, teamB] for the veto.
 */
export function chooseVetoRoles(
  higherSeed: string,
  lowerSeed: string,
  format: MatchFormat,
  model: MatchModel,
  veto: VetoRules,
): [string, string] {
  const asA = vetoMaps(higherSeed, lowerSeed, format, model, veto)
  const asB = vetoMaps(lowerSeed, higherSeed, format, model, veto)
  const pAsA = seriesWinProbability(
    asA.map((map) => model.mapWin(higherSeed, lowerSeed, map)),
    format,
  )
  const pAsB = seriesWinProbability(
    asB.map((map) => model.mapWin(higherSeed, lowerSeed, map)),
    format,
  )
  return pAsA >= pAsB ? [higherSeed, lowerSeed] : [lowerSeed, higherSeed]
}

/** Expected maps (greedy veto) and the series win probability for the higher seed. */
export function expectedSeries(
  higherSeed: string,
  lowerSeed: string,
  format: MatchFormat,
  model: MatchModel,
  veto: VetoRules,
): { maps: MapId[]; pHigher: number } {
  const [a, b] = chooseVetoRoles(higherSeed, lowerSeed, format, model, veto)
  const maps = vetoMaps(a, b, format, model, veto)
  const pHigher = seriesWinProbability(
    maps.map((map) => model.mapWin(higherSeed, lowerSeed, map)),
    format,
  )
  return { maps, pHigher }
}

/**
 * The exact chance that the higher seed wins the series `playSeries` plays: the same veto roles,
 * every veto the randomized veto can produce weighted by its probability, then the maps in play
 * order. No Monte Carlo noise, and the same number whichever order matches are simulated in.
 */
export function seriesWinChance(
  higherSeed: string,
  lowerSeed: string,
  format: MatchFormat,
  model: MatchModel,
  veto: VetoRules,
): number {
  const [a, b] = chooseVetoRoles(higherSeed, lowerSeed, format, model, veto)
  const outcomes = vetoOutcomes(
    procedureFor(format, veto).steps,
    model.mapPool,
    vetoAdvantage(a, b, model),
    model.vetoTemperature,
    vetoHabit(a, b, model),
  )
  let total = 0
  for (const { maps, p } of outcomes) {
    total +=
      p *
      seriesWinProbability(
        maps.map((map) => model.mapWin(higherSeed, lowerSeed, map)),
        format,
      )
  }
  return total
}

/**
 * The chance of each map in each slot of the series (index 0 = first map played), over every veto
 * the randomized veto can produce, with the same veto roles as `seriesWinChance`. Every slot is
 * listed, even a decider that is only played when the series goes the distance.
 */
export function mapSlotChances(
  higherSeed: string,
  lowerSeed: string,
  format: MatchFormat,
  model: MatchModel,
  veto: VetoRules,
): Array<Map<MapId, number>> {
  const [a, b] = chooseVetoRoles(higherSeed, lowerSeed, format, model, veto)
  const outcomes = vetoOutcomes(
    procedureFor(format, veto).steps,
    model.mapPool,
    vetoAdvantage(a, b, model),
    model.vetoTemperature,
    vetoHabit(a, b, model),
  )
  const slots: Array<Map<MapId, number>> = []
  for (const { maps, p } of outcomes) {
    maps.forEach((map, slot) => {
      const chances = slots[slot] ?? new Map<MapId, number>()
      chances.set(map, (chances.get(map) ?? 0) + p)
      slots[slot] = chances
    })
  }
  return slots
}

/** mapSlotChances as plain records, rounded to 4 decimals, most likely map first (for snapshots). */
export function mapSlotRecords(
  higherSeed: string,
  lowerSeed: string,
  format: MatchFormat,
  model: MatchModel,
  veto: VetoRules,
): Array<Record<MapId, number>> {
  return mapSlotChances(higherSeed, lowerSeed, format, model, veto).map((slot) =>
    Object.fromEntries(
      [...slot.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([map, p]) => [map, Math.round(p * 10_000) / 10_000]),
    ),
  )
}

/** Plays one series map by map with a randomized veto. */
export function playSeries(
  higherSeed: string,
  lowerSeed: string,
  format: MatchFormat,
  model: MatchModel,
  veto: VetoRules,
  rng: Rng,
  roles?: [string, string],
): SeriesResult {
  const [a, b] = roles ?? chooseVetoRoles(higherSeed, lowerSeed, format, model, veto)
  const order = vetoMaps(a, b, format, model, veto, rng)
  const needed = winsNeeded[format]
  const maps: SeriesResult['maps'] = []
  let winsHigher = 0
  let winsLower = 0
  for (const map of order) {
    const higherWins = rng.next() < model.mapWin(higherSeed, lowerSeed, map)
    maps.push({ map, winner: higherWins ? higherSeed : lowerSeed })
    if (higherWins) winsHigher++
    else winsLower++
    if (winsHigher === needed) return { winner: higherSeed, maps }
    if (winsLower === needed) return { winner: lowerSeed, maps }
  }
  throw new Error(`Series ${higherSeed} vs ${lowerSeed} (${format}) ran out of maps`)
}

/** Plays a match between the higher and the lower seed and returns the winner. */
export type PlayMatch = (higherSeed: string, lowerSeed: string, format: MatchFormat) => string

/**
 * A series player for Monte Carlo runs: plays map by map with a randomized veto drawn from `rng`,
 * caching the deterministic veto-role choice per pairing and format.
 */
export function seriesPlayer(model: MatchModel, veto: VetoRules, rng: Rng): PlayMatch {
  const roles = new Map<string, [string, string]>()
  return (higherSeed, lowerSeed, format) => {
    const key = `${higherSeed}|${lowerSeed}|${format}`
    let value = roles.get(key)
    if (!value) {
      value = chooseVetoRoles(higherSeed, lowerSeed, format, model, veto)
      roles.set(key, value)
    }
    return playSeries(higherSeed, lowerSeed, format, model, veto, rng, value).winner
  }
}
