import type { MatchFormat } from '../../data/schemas/common.ts'
import type { MatchModel } from '../match-model.ts'
import { createRng, type Rng } from '../rng.ts'
import { chooseVetoRoles, playSeries, type VetoRules } from '../series.ts'
import {
  type BracketMatch,
  type PlayoffResult,
  type PlayoffRules,
  resolveBracket,
  roundCount,
} from './bracket.ts'

export interface PlayoffSimInput {
  /** Playoff seeds (final Stage 3 seed order), index 0 = seed 1. */
  seeds: readonly string[]
  rules: PlayoffRules
  veto: VetoRules
  model: MatchModel
  /** Real results so far in the playoffs. */
  played: readonly PlayoffResult[]
  runs: number
  seed: number
}

export interface UpcomingPlayoffMatch {
  round: number
  index: number
  thirdPlace: boolean
  format: MatchFormat
  /** The higher seed. */
  teamA: string
  teamB: string
  /** Probability that teamA wins. */
  pA: number
}

export interface PlayoffTeamOdds {
  teamId: string
  /** Reaches the semifinals (the round before the final). */
  pSemifinal: number
  /** Reaches the final. */
  pFinal: number
  /** Wins the event. */
  pTitle: number
  /** Wins the third-place match; undefined when the event has none. */
  pThird?: number
}

export interface PlayoffSimResult {
  /** The bracket from real results only: decided matches, known pairings, open slots. */
  bracket: BracketMatch[]
  /** Matches with both teams known and no real result yet. */
  upcoming: UpcomingPlayoffMatch[]
  teams: PlayoffTeamOdds[]
  runs: number
  /** Standard error of the least certain probability reported. */
  maxStandardError: number
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Real results by pair. Throws on a pair that met twice or a winner that did not play. */
export function realResultsByPair(played: readonly PlayoffResult[]): Map<string, PlayoffResult> {
  const byPair = new Map<string, PlayoffResult>()
  for (const result of played) {
    if (result.winner !== result.teamA && result.winner !== result.teamB) {
      throw new Error(`Winner ${result.winner} did not play ${result.teamA} vs ${result.teamB}`)
    }
    const key = pairKey(result.teamA, result.teamB)
    if (byPair.has(key)) throw new Error(`${result.teamA} vs ${result.teamB} appears twice`)
    byPair.set(key, result)
  }
  return byPair
}

/**
 * The bracket as far as real results decide it. Throws if a real result does not fit the bracket
 * (wrong seeds or a mistyped team), so the simulation never silently ignores a result.
 */
export function realBracket(
  seeds: readonly string[],
  rules: PlayoffRules,
  played: readonly PlayoffResult[],
): BracketMatch[] {
  const real = realResultsByPair(played)
  const used = new Set<string>()
  const bracket = resolveBracket(seeds, rules, ({ teamA, teamB }) => {
    const key = pairKey(teamA, teamB)
    const result = real.get(key)
    if (result) used.add(key)
    return result?.winner
  })
  const unused = [...real.keys()].filter((key) => !used.has(key))
  if (unused.length > 0) {
    // Either an earlier result in that pair's path is missing (results logged out of order), or the
    // pair cannot meet with these seeds. Both would make the simulation ignore a real result.
    throw new Error(
      `Real playoff results that no bracket slot holds yet: ${unused.join(', ')}. ` +
        'An earlier match in their path has no result, or the playoff seeds are wrong.',
    )
  }
  return bracket
}

/** Plays the rest of the bracket once: real results where they exist, simulated series elsewhere. */
export function playPlayoffsOnce(
  seeds: readonly string[],
  rules: PlayoffRules,
  real: ReadonlyMap<string, PlayoffResult>,
  play: (higher: string, lower: string, format: MatchFormat) => string,
): BracketMatch[] {
  return resolveBracket(
    seeds,
    rules,
    ({ teamA, teamB, format }) =>
      real.get(pairKey(teamA, teamB))?.winner ?? play(teamA, teamB, format),
  )
}

/** A series player for the Monte Carlo, with the veto-role choice cached per pairing and format. */
export function seriesPlayer(
  model: MatchModel,
  veto: VetoRules,
  rng: Rng,
): (higher: string, lower: string, format: MatchFormat) => string {
  const roles = new Map<string, [string, string]>()
  return (higher, lower, format) => {
    const key = `${higher}|${lower}|${format}`
    let value = roles.get(key)
    if (!value) {
      value = chooseVetoRoles(higher, lower, format, model, veto)
      roles.set(key, value)
    }
    return playSeries(higher, lower, format, model, veto, rng, value).winner
  }
}

/** Monte Carlo of the rest of a single-elimination bracket. Deterministic for a given input and seed. */
export function simulatePlayoffs(input: PlayoffSimInput): PlayoffSimResult {
  const { seeds, rules, runs } = input
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error(`Playoff simulation needs runs >= 1, got ${runs}`)
  const bracket = realBracket(seeds, rules, input.played)
  const real = realResultsByPair(input.played)
  const rounds = roundCount(rules)
  const rng = createRng(input.seed)
  const play = seriesPlayer(input.model, input.veto, rng)

  const open = bracket.filter(
    (m): m is BracketMatch & { teamA: string; teamB: string } =>
      m.teamA !== undefined && m.teamB !== undefined && m.winner === undefined,
  )
  const upcomingWins = new Map(open.map((m) => [pairKey(m.teamA, m.teamB), 0]))
  const counts = new Map(seeds.map((id) => [id, { semi: 0, final: 0, title: 0, third: 0 }]))
  const count = (team: string | undefined) => (team === undefined ? undefined : counts.get(team))

  for (let run = 0; run < runs; run++) {
    for (const match of playPlayoffsOnce(seeds, rules, real, play)) {
      const key = match.teamA && match.teamB ? pairKey(match.teamA, match.teamB) : ''
      const wins = upcomingWins.get(key)
      if (wins !== undefined && match.winner === match.teamA) upcomingWins.set(key, wins + 1)
      if (match.thirdPlace) {
        const c = count(match.winner)
        if (c) c.third++
        continue
      }
      if (rounds >= 2 && match.round === rounds - 1) {
        for (const team of [match.teamA, match.teamB]) {
          const c = count(team)
          if (c) c.semi++
        }
      }
      if (match.round === rounds) {
        for (const team of [match.teamA, match.teamB]) {
          const c = count(team)
          if (c) c.final++
        }
        const c = count(match.winner)
        if (c) c.title++
      }
    }
  }

  const hasThird = rules.thirdPlaceDecider && rounds >= 2
  const teams: PlayoffTeamOdds[] = seeds.map((teamId) => {
    const c = counts.get(teamId)
    if (!c) throw new Error(`Missing counts for ${teamId}`)
    return {
      teamId,
      // A one-round bracket has no semifinal: every team starts in the final, so this is 1.
      pSemifinal: rounds >= 2 ? c.semi / runs : 1,
      pFinal: c.final / runs,
      pTitle: c.title / runs,
      ...(hasThird ? { pThird: c.third / runs } : {}),
    }
  })
  const upcoming: UpcomingPlayoffMatch[] = open.map((m) => ({
    round: m.round,
    index: m.index,
    thirdPlace: m.thirdPlace,
    format: m.format,
    teamA: m.teamA,
    teamB: m.teamB,
    pA: (upcomingWins.get(pairKey(m.teamA, m.teamB)) ?? 0) / runs,
  }))

  const probabilities = [
    ...teams.flatMap((t) => [t.pSemifinal, t.pFinal, t.pTitle, t.pThird ?? 0]),
    ...upcoming.map((m) => m.pA),
  ]
  const maxStandardError = Math.max(0, ...probabilities.map((p) => Math.sqrt((p * (1 - p)) / runs)))
  return { bracket, upcoming, teams, runs, maxStandardError }
}
