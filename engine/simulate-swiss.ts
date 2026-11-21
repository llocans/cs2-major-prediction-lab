import type { MatchFormat } from '../data/schemas/common.ts'
import type { MatchModel } from './match-model.ts'
import { createRng } from './rng.ts'
import { chooseVetoRoles, playSeries, type VetoRules } from './series.ts'
import { type SwissFormat, swissMatchFormat } from './swiss/format.ts'
import { pairRound } from './swiss/pairing.ts'
import { buildRecords, isActive } from './swiss/records.ts'
import type { Pairing, SwissMatch, SwissRules } from './swiss/types.ts'

export interface SwissSimInput {
  /** Stage seeds, index 0 = seed 1. */
  seeds: readonly string[]
  rules: SwissRules
  format: SwissFormat
  veto: VetoRules
  model: MatchModel
  /** Real results so far in this stage. */
  played: readonly SwissMatch[]
  /** Officially announced pairings for the current round (override the engine's pairing). */
  announced?: readonly Pairing[]
  runs: number
  seed: number
}

export interface UpcomingMatch extends Pairing {
  round: number
  format: MatchFormat
  /** Probability that teamA (the higher seed) wins. */
  pA: number
}

export interface TeamOdds {
  teamId: string
  p30: number
  pAdvance: number
  p03: number
  pEliminated: number
  /** Distribution of final records, e.g. { "3-1": 0.21 }. */
  records: Record<string, number>
}

export interface SwissSimResult {
  currentRound: number
  /** Pairings of the current round that are not played yet. */
  upcoming: UpcomingMatch[]
  teams: TeamOdds[]
  runs: number
  /** Standard error of the least certain probability reported. */
  maxStandardError: number
}

const ROUNDS = 5

/** The first round that still has matches to play, or ROUNDS + 1 if the stage is over. */
export function currentRound(
  seeds: readonly string[],
  played: readonly SwissMatch[],
  rules: SwissRules,
): number {
  for (let round = 1; round <= ROUNDS; round++) {
    const before = buildRecords(
      seeds,
      played.filter((m) => m.round < round),
    )
    const active = [...before.values()].filter((r) => isActive(r, rules)).length
    const done = played.filter((m) => m.round === round).length
    if (done < active / 2) return round
  }
  return ROUNDS + 1
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Pairings for a round: announced ones for the current round if given, else the Valve rules. */
function pairingsFor(
  round: number,
  input: SwissSimInput,
  matches: readonly SwissMatch[],
  current: number,
): Pairing[] {
  if (round === current && input.announced && input.announced.length > 0)
    return [...input.announced]
  return pairRound(round, input.seeds, matches, input.rules)
}

/** Monte Carlo of the rest of a Swiss stage. Deterministic for a given input and seed. */
export function simulateSwiss(input: SwissSimInput): SwissSimResult {
  const { seeds, rules, model, veto, runs } = input
  const rng = createRng(input.seed)
  const current = currentRound(seeds, input.played, rules)

  // Check: real results of the current round must match its pairings.
  const currentPairs = current <= ROUNDS ? pairingsFor(current, input, input.played, current) : []
  const currentKeys = new Set(currentPairs.map((p) => pairKey(p.teamA, p.teamB)))
  for (const match of input.played.filter((m) => m.round === current)) {
    if (!currentKeys.has(pairKey(match.teamA, match.teamB))) {
      throw new Error(
        `Round ${current}: real match ${match.teamA} vs ${match.teamB} differs from the computed pairings. ` +
          'Pass the announced pairings.',
      )
    }
  }
  const realByKey = new Map(input.played.map((m) => [`${m.round}|${pairKey(m.teamA, m.teamB)}`, m]))

  const roleCache = new Map<string, [string, string]>()
  const roles = (a: string, b: string, format: MatchFormat) => {
    const key = `${a}|${b}|${format}`
    let value = roleCache.get(key)
    if (!value) {
      value = chooseVetoRoles(a, b, format, model, veto)
      roleCache.set(key, value)
    }
    return value
  }

  const counts = new Map(
    seeds.map((id) => [
      id,
      { p30: 0, adv: 0, p03: 0, elim: 0, records: new Map<string, number>() },
    ]),
  )
  const upcomingWins = new Map<string, number>()

  for (let run = 0; run < runs; run++) {
    const matches: SwissMatch[] = input.played.filter((m) => m.round < current)
    for (let round = current; round <= ROUNDS; round++) {
      const pairs = round === current ? currentPairs : pairingsFor(round, input, matches, current)
      const records = buildRecords(seeds, matches)
      for (const { teamA, teamB } of pairs) {
        const real = realByKey.get(`${round}|${pairKey(teamA, teamB)}`)
        if (real) {
          matches.push(real)
          continue
        }
        const a = records.get(teamA)
        const b = records.get(teamB)
        if (!a || !b) throw new Error(`Unknown team in pairing ${teamA} vs ${teamB}`)
        const format = swissMatchFormat(a, b, rules, input.format)
        const series = playSeries(
          teamA,
          teamB,
          format,
          model,
          veto,
          rng,
          roles(teamA, teamB, format),
        )
        matches.push({ round, teamA, teamB, winner: series.winner })
        if (round === current && series.winner === teamA) {
          const key = pairKey(teamA, teamB)
          upcomingWins.set(key, (upcomingWins.get(key) ?? 0) + 1)
        }
      }
    }
    for (const record of buildRecords(seeds, matches).values()) {
      const count = counts.get(record.teamId)
      if (!count) continue
      if (record.wins >= rules.winsToAdvance) count.adv++
      else count.elim++
      if (record.wins >= rules.winsToAdvance && record.losses === 0) count.p30++
      if (record.losses >= rules.lossesToEliminate && record.wins === 0) count.p03++
      const label = `${record.wins}-${record.losses}`
      count.records.set(label, (count.records.get(label) ?? 0) + 1)
    }
  }

  const startRecords = buildRecords(
    seeds,
    input.played.filter((m) => m.round < current),
  )
  const upcoming: UpcomingMatch[] = currentPairs
    .filter((p) => !realByKey.has(`${current}|${pairKey(p.teamA, p.teamB)}`))
    .map((p) => {
      const a = startRecords.get(p.teamA)
      const b = startRecords.get(p.teamB)
      if (!a || !b) throw new Error(`Unknown team in pairing ${p.teamA} vs ${p.teamB}`)
      return {
        round: current,
        teamA: p.teamA,
        teamB: p.teamB,
        format: swissMatchFormat(a, b, rules, input.format),
        pA: (upcomingWins.get(pairKey(p.teamA, p.teamB)) ?? 0) / runs,
      }
    })

  const teams: TeamOdds[] = seeds.map((teamId) => {
    const count = counts.get(teamId)
    if (!count) throw new Error(`Missing counts for ${teamId}`)
    return {
      teamId,
      p30: count.p30 / runs,
      pAdvance: count.adv / runs,
      p03: count.p03 / runs,
      pEliminated: count.elim / runs,
      records: Object.fromEntries([...count.records].map(([label, n]) => [label, n / runs])),
    }
  })

  const probabilities = [
    ...teams.flatMap((t) => [t.p30, t.pAdvance, t.p03]),
    ...upcoming.map((m) => m.pA),
  ]
  const maxStandardError = Math.max(0, ...probabilities.map((p) => Math.sqrt((p * (1 - p)) / runs)))

  return { currentRound: current, upcoming, teams, runs, maxStandardError }
}
