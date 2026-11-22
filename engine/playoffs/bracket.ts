import type { MatchFormat } from '../../data/schemas/common.ts'
import type { PlayoffStage } from '../../data/schemas/event-config.ts'

/**
 * The bracket rules the engine needs, taken straight from the event config's single-elimination
 * stage. `bracket` holds round 1 pairs of 1-based seeds in bracket order: the winners of pairs 1 and
 * 2 meet in round 2, as do the winners of pairs 3 and 4, and so on (a power-of-two number of pairs).
 * With `thirdPlaceDecider`, the semifinal losers play for third place.
 */
export type PlayoffRules = Pick<PlayoffStage, 'bracket' | 'format' | 'thirdPlaceDecider'>

/** A finished playoff match (real or simulated). Rounds are not needed: a pair meets at most once. */
export interface PlayoffResult {
  teamA: string
  teamB: string
  winner: string
}

export interface BracketMatch {
  /** 1 = first round; the final is the last round. The third-place match shares the final's round. */
  round: number
  /**
   * 0-based position within the round in bracket order (0 for the third-place match). Liquipedia may
   * draw the matches of one half in another order; match real results by pair, not by position.
   */
  index: number
  thirdPlace: boolean
  format: MatchFormat
  /** The higher seed, once known. */
  teamA?: string
  /** The lower seed, once known. */
  teamB?: string
  winner?: string
}

/** Decides a match whose teams are known; `undefined` leaves it (and what depends on it) open. */
export type DecideMatch = (
  match: BracketMatch & { teamA: string; teamB: string },
) => string | undefined

/** Number of rounds of a bracket with this many first-round pairs (4 pairs: 3 rounds). */
export function roundCount(rules: PlayoffRules): number {
  return Math.log2(rules.bracket.length) + 1
}

/** Throws unless the seeds and bracket describe a valid single-elimination bracket. */
export function validateBracket(seeds: readonly string[], rules: PlayoffRules): void {
  const pairs = rules.bracket.length
  if (pairs < 1 || !Number.isInteger(Math.log2(pairs))) {
    throw new Error(`Playoff bracket needs a power-of-two number of pairs, got ${pairs}`)
  }
  if (seeds.length !== pairs * 2) {
    throw new Error(`Playoff bracket has ${pairs * 2} slots but ${seeds.length} seeds`)
  }
  const used = rules.bracket.flat()
  const expected = seeds.map((_, i) => i + 1)
  if ([...used].sort((a, b) => a - b).join() !== expected.join()) {
    throw new Error(
      `Playoff bracket must use seeds 1-${seeds.length} once each, got ${used.join()}`,
    )
  }
  if (new Set(seeds).size !== seeds.length) throw new Error('Playoff seeds contain a team twice')
}

/**
 * Walks the bracket round by round. `decide` returns each match's winner (from a real result or a
 * simulation). Matches whose teams depend on an undecided match keep those teams unset.
 * The higher seed (lower seed number) is always teamA. Pure; no randomness of its own.
 */
export function resolveBracket(
  seeds: readonly string[],
  rules: PlayoffRules,
  decide: DecideMatch,
): BracketMatch[] {
  validateBracket(seeds, rules)
  const seedOf = new Map(seeds.map((team, i) => [team, i + 1]))
  const rank = (team: string) => seedOf.get(team) ?? Number.POSITIVE_INFINITY
  const rounds = roundCount(rules)
  const matches: BracketMatch[] = []

  const play = (
    round: number,
    index: number,
    thirdPlace: boolean,
    format: MatchFormat,
    x: string | undefined,
    y: string | undefined,
  ): BracketMatch => {
    const match: BracketMatch = { round, index, thirdPlace, format }
    if (x !== undefined && y !== undefined) {
      const [teamA, teamB] = rank(x) <= rank(y) ? [x, y] : [y, x]
      match.teamA = teamA
      match.teamB = teamB
      const winner = decide({ ...match, teamA, teamB })
      if (winner !== undefined) {
        if (winner !== teamA && winner !== teamB) {
          throw new Error(`Winner ${winner} did not play ${teamA} vs ${teamB}`)
        }
        match.winner = winner
      }
    }
    matches.push(match)
    return match
  }
  const loserOf = (m: BracketMatch) =>
    m.winner === undefined ? undefined : m.winner === m.teamA ? m.teamB : m.teamA

  let entrants: Array<[string | undefined, string | undefined]> = rules.bracket.map(([x, y]) => [
    seeds[x - 1],
    seeds[y - 1],
  ])
  let semifinalLosers: Array<string | undefined> = []
  for (let round = 1; round <= rounds; round++) {
    const format = round === rounds ? rules.format.final : rules.format.default
    const played = entrants.map(([x, y], index) => play(round, index, false, format, x, y))
    if (round === rounds - 1) semifinalLosers = played.map(loserOf)
    entrants = []
    for (let i = 0; i < played.length; i += 2) {
      entrants.push([played[i]?.winner, played[i + 1]?.winner])
    }
  }
  if (rules.thirdPlaceDecider && rounds >= 2) {
    const format = rules.format.thirdPlace ?? rules.format.default
    play(rounds, 0, true, format, semifinalLosers[0], semifinalLosers[1])
  }
  return matches
}
