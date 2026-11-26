import type { MapId } from '../data/schemas/common.ts'
import type { ModelParams, Modifier, Ratings } from '../data/schemas/model.ts'
import type { TeamVetoStats } from '../data/schemas/team-stats.ts'
import { activeModifiers, modifierDelta } from './ratings/modifiers.ts'
import { winProbability } from './ratings/probability.ts'

/** Percentage points added to every habit share (see `vetoHabit`). */
const HABIT_FLOOR = 1

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
  /**
   * A team's real habit for a veto action over the remaining maps (params.veto.habits), or
   * undefined without habit data or without the setting. Shares are HLTV's percentages; a map the
   * team never played in the window counts as a full ban share and no pick share.
   */
  vetoHabit(
    team: string,
    action: 'ban' | 'pick',
    remaining: readonly MapId[],
  ): { shares: number[]; weight: number } | undefined
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
  /** Teams' pick and ban shares (data/teams/vetoes/), used when params.veto.habits is set. */
  vetoStats: Readonly<Record<string, TeamVetoStats>> = {},
): MatchModel {
  const active = activeModifiers(modifiers, today)
  const habits = params.veto.habits
  const unplayedMinMaps = params.maps.unplayedMinMaps
  if (habits) {
    const teams = Object.values(vetoStats)
    if (teams.length === 0) {
      throw new Error(`Model ${params.version} uses veto habits, but no veto stats were loaded`)
    }
    for (const stats of teams) {
      if (stats.window.from !== habits.window.from || stats.window.to !== habits.window.to) {
        throw new Error(
          `Model ${params.version} uses veto stats from ${habits.window.from} to ${habits.window.to}; ` +
            `${stats.teamId}'s run from ${stats.window.from} to ${stats.window.to} (a new window needs a new version)`,
        )
      }
    }
  }

  const strengthCache = new Map<string, { strength: number; variance: number }>()
  const lookup = (team: string, map: MapId) => {
    const key = `${team}|${map}`
    const cached = strengthCache.get(key)
    if (cached) return cached
    const rating = ratings.teams[team]
    if (!rating) throw new Error(`No rating for team "${team}"`)
    const mapStrength = rating.maps[map] ?? { offset: 0, rd: params.maps.newMapRd, n: 0 }
    const value = {
      strength:
        rating.rating +
        mapStrength.offset +
        modifierDelta(active, team, map, params.modifiers.maxAbs),
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
    vetoHabit(team, action, remaining) {
      const stats = vetoStats[team]
      if (!habits || !stats || stats.mapsPlayed === 0) return undefined
      const weight = (habits.weight * stats.mapsPlayed) / (stats.mapsPlayed + habits.shrinkMaps)
      // A map never played in a sample this size is most likely a permanent ban (the same threshold
      // as the map strength rule); in a smaller sample its absence says nothing: average ban share.
      const listed = Object.values(stats.maps)
      const meanBan = listed.reduce((sum, r) => sum + r.ban, 0) / Math.max(listed.length, 1)
      const absentBan = stats.mapsPlayed >= unplayedMinMaps ? 100 : meanBan
      // A small floor keeps every map possible and avoids a jump when all shares are 0.
      const shares = remaining.map((map) => {
        const rates = stats.maps[map]
        const share = rates
          ? action === 'ban'
            ? rates.ban
            : rates.pick
          : action === 'ban'
            ? absentBan
            : 0
        return share + HABIT_FLOOR
      })
      return { shares, weight }
    },
    mapWin(a, b, map) {
      const key = `${a}|${b}|${map}`
      const cached = winCache.get(key)
      if (cached !== undefined) return cached
      // Always compute in one team order and derive the other as 1 - p. Computing whichever order
      // was asked first made the value depend on call history in the last bit, so the same input and
      // seed could give different simulations depending on what ran before.
      const [first, second] = a < b ? [a, b] : [b, a]
      const x = lookup(first, map)
      const y = lookup(second, map)
      const p = winProbability(x.strength - y.strength, x.variance + y.variance, params.scale)
      winCache.set(`${first}|${second}|${map}`, p)
      winCache.set(`${second}|${first}|${map}`, 1 - p)
      return a === first ? p : 1 - p
    },
  }
}
