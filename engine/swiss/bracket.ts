import type { MatchFormat } from '../../data/schemas/common.ts'
import { type SwissFormat, swissMatchFormat } from './format.ts'
import { pairRound } from './pairing.ts'
import { buildRecords, isActive } from './records.ts'
import type { Pairing, SwissMatch, SwissRules } from './types.ts'

export type MatchKind = 'real' | 'override' | 'pending'

export interface KnownMatch extends SwissMatch {
  kind: 'real' | 'override'
}

export interface BracketMatch {
  round: number
  teamA: string
  teamB: string
  format: MatchFormat
  kind: MatchKind
  winner?: string
}

export interface BracketGroup {
  /** W-L record of every team in the group before the round, e.g. "1-0". */
  record: string
  matches: BracketMatch[]
}

export interface BracketRound {
  round: number
  /** False when the previous round is not complete, so pairings are not known yet. */
  known: boolean
  groups: BracketGroup[]
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * The Swiss bracket as far as it is determined by real results and overrides.
 * A round's pairings are known once every match of the previous round has a winner.
 */
export function swissBracket(
  seeds: readonly string[],
  known: readonly KnownMatch[],
  rules: SwissRules,
  format: SwissFormat,
  announced?: { round: number; pairings: readonly Pairing[] },
  rounds = 5,
): BracketRound[] {
  const result: BracketRound[] = []
  let previousComplete = true
  for (let round = 1; round <= rounds; round++) {
    if (!previousComplete) {
      result.push({ round, known: false, groups: [] })
      continue
    }
    const before = known.filter((m) => m.round < round)
    const records = buildRecords(seeds, before)
    const inRound = new Map(
      known.filter((m) => m.round === round).map((m) => [pairKey(m.teamA, m.teamB), m]),
    )
    const pairs =
      announced?.round === round && announced.pairings.length > 0
        ? announced.pairings
        : pairRound(round, seeds, before, rules)

    const groups = new Map<string, BracketMatch[]>()
    for (const { teamA, teamB } of pairs) {
      const a = records.get(teamA)
      const b = records.get(teamB)
      if (!a || !b) throw new Error(`Unknown team in pairing ${teamA} vs ${teamB}`)
      const played = inRound.get(pairKey(teamA, teamB))
      const match: BracketMatch = {
        round,
        teamA,
        teamB,
        format: swissMatchFormat(a, b, rules, format),
        kind: played?.kind ?? 'pending',
      }
      if (played) match.winner = played.winner
      const key = `${a.wins}-${a.losses}`
      groups.set(key, [...(groups.get(key) ?? []), match])
    }
    const active = [...records.values()].filter((r) => isActive(r, rules)).length
    previousComplete = inRound.size >= active / 2
    result.push({
      round,
      known: true,
      groups: [...groups.entries()].map(([record, matches]) => ({ record, matches })),
    })
  }
  return result
}
