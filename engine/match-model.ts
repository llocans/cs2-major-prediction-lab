import type { MapId } from '../data/schemas/common.ts'
import type { ModelParams, Modifier, Ratings } from '../data/schemas/model.ts'
import { winProbability } from './ratings/probability.ts'

/** Everything the simulation needs to know about how strong teams are. */
export interface MatchModel {
  mapPool: readonly MapId[]
  /** Probability that `a` beats `b` on `map`. Cached. */
  mapWin(a: string, b: string, map: MapId): number
  /** Strength of a team on a map (rating + map offset + active modifiers), in rating points. */
  strength(team: string, map: MapId): number
  /** Team-level uncertainty (rd). */
  rd(team: string): number
  /** Number of maps behind a team's map offset (0 = no map data). */
  mapSamples(team: string, map: MapId): number
  /** Active modifiers for a team, for explanations. */
  modifiersFor(team: string): readonly Modifier[]
  vetoTemperature: number
}

/**
 * Builds a match model from ratings, modifiers and params. `today` decides which modifiers are active
 * (a modifier applies while today <= expires).
 */
export function buildMatchModel(
  ratings: Ratings,
  modifiers: readonly Modifier[],
  params: ModelParams,
  mapPool: readonly MapId[],
  today: string,
): MatchModel {
  const active = modifiers.filter(
    (modifier) => modifier.createdAt <= today && today <= modifier.expires,
  )
  const cap = params.modifiers.maxAbs
  const clamp = (value: number) => Math.max(-cap, Math.min(cap, value))

  const strengthCache = new Map<string, { strength: number; variance: number }>()
  const lookup = (team: string, map: MapId) => {
    const key = `${team}|${map}`
    const cached = strengthCache.get(key)
    if (cached) return cached
    const rating = ratings.teams[team]
    if (!rating) throw new Error(`No rating for team "${team}"`)
    const mapStrength = rating.maps[map] ?? { offset: 0, rd: params.maps.newMapRd, n: 0 }
    const modifierTotal = active
      .filter((m) => m.teamId === team && (m.map === undefined || m.map === map))
      .reduce((sum, m) => sum + m.delta, 0)
    const value = {
      strength: rating.rating + mapStrength.offset + clamp(modifierTotal),
      variance: rating.rd ** 2 + mapStrength.rd ** 2,
    }
    strengthCache.set(key, value)
    return value
  }

  const winCache = new Map<string, number>()
  return {
    mapPool,
    vetoTemperature: params.veto.temperature,
    strength: (team, map) => lookup(team, map).strength,
    rd: (team) => {
      const rating = ratings.teams[team]
      if (!rating) throw new Error(`No rating for team "${team}"`)
      return rating.rd
    },
    mapSamples: (team, map) => ratings.teams[team]?.maps[map]?.n ?? 0,
    modifiersFor: (team) => active.filter((m) => m.teamId === team),
    mapWin(a, b, map) {
      const key = `${a}|${b}|${map}`
      const cached = winCache.get(key)
      if (cached !== undefined) return cached
      const x = lookup(a, map)
      const y = lookup(b, map)
      const p = winProbability(x.strength - y.strength, x.variance + y.variance, params.scale)
      winCache.set(key, p)
      winCache.set(`${b}|${a}|${map}`, 1 - p)
      return p
    },
  }
}
