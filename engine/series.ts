import type { MapId, MatchFormat } from '../data/schemas/common.ts'
import { winsNeeded } from '../data/schemas/common.ts'
import type { VetoProcedure } from '../data/schemas/event-config.ts'
import type { MatchModel } from './match-model.ts'
import type { Rng } from './rng.ts'
import { runVeto } from './veto.ts'

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

/** The maps a veto produces, with `first` as Team A. */
function vetoMaps(
  first: string,
  second: string,
  format: MatchFormat,
  model: MatchModel,
  veto: VetoRules,
  rng?: Rng,
): MapId[] {
  const sides = { A: first, B: second } as const
  const advantage = (side: 'A' | 'B', map: MapId) => {
    const me = sides[side]
    const them = side === 'A' ? second : first
    return model.strength(me, map) - model.strength(them, map)
  }
  return runVeto(
    procedureFor(format, veto).steps,
    model.mapPool,
    advantage,
    model.vetoTemperature,
    rng,
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
