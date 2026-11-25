import type { MatchFormat } from '../data/schemas/common.ts'
import type { MatchModel } from './match-model.ts'
import { createRng } from './rng.ts'
import { type PlayMatch, seriesPlayer, seriesWinChance, type VetoRules } from './series.ts'
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
  /**
   * Officially announced pairings for the current round (override the engine's pairing). May list
   * only the matches not played yet, as a live stage page does.
   */
  announced?: readonly Pairing[]
  runs: number
  seed: number
}

export interface UpcomingMatch extends Pairing {
  round: number
  format: MatchFormat
  /** Exact probability that teamA (the higher seed) wins (`seriesWinChance`, no sampling noise). */
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

/**
 * Pairings of the current round. Announced pairings override the Valve rules, but a live stage page
 * lists only the matches not played yet, so the round's real matches are added to them. They are used
 * only when together they pair every active team exactly once; otherwise (a page half edited, an
 * announcement for the wrong round) the Valve rules apply.
 */
function currentRoundPairs(input: SwissSimInput, current: number): Pairing[] {
  const computed = () => pairRound(current, input.seeds, input.played, input.rules)
  if (!input.announced || input.announced.length === 0) return computed()
  const playedNow: Pairing[] = input.played
    .filter((m) => m.round === current)
    .map(({ teamA, teamB }) => ({ teamA, teamB }))
  const playedKeys = new Set(playedNow.map((p) => pairKey(p.teamA, p.teamB)))
  const merged = [
    ...playedNow,
    ...input.announced.filter((p) => !playedKeys.has(pairKey(p.teamA, p.teamB))),
  ]
  const active = [
    ...buildRecords(
      input.seeds,
      input.played.filter((m) => m.round < current),
    ).values(),
  ]
    .filter((r) => isActive(r, input.rules))
    .map((r) => r.teamId)
  const teams = merged.flatMap((p) => [p.teamA, p.teamB])
  const complete =
    teams.length === active.length &&
    new Set(teams).size === teams.length &&
    active.every((id) => teams.includes(id))
  if (!complete) return computed()
  // The same draw as the Valve rules, listed in another order (a stage page's order): use the
  // rules' order, so every run of this round draws the same random numbers as a run without the
  // announcement (the site's) and the odds match to the digit.
  let rulesPairs: Pairing[]
  try {
    rulesPairs = computed()
  } catch {
    // The rules cannot pair this round (e.g. a result missing upstream): the announcement stands.
    return merged
  }
  const rulesKeys = new Set(rulesPairs.map((p) => pairKey(p.teamA, p.teamB)))
  const same =
    rulesPairs.length === merged.length &&
    merged.every((p) => rulesKeys.has(pairKey(p.teamA, p.teamB)))
  return same ? rulesPairs : merged
}

/**
 * Plays a Swiss stage once from `fromRound` to the end: real results where they exist (matched by
 * round and pair), simulated series elsewhere. Returns every match of the stage, real and simulated.
 */
export function playSwissRounds(args: {
  seeds: readonly string[]
  rules: SwissRules
  format: SwissFormat
  /** Real results of this stage. */
  played: readonly SwissMatch[]
  fromRound: number
  pairings: (round: number, matches: readonly SwissMatch[]) => Pairing[]
  play: PlayMatch
}): SwissMatch[] {
  const { seeds, rules, format, play } = args
  const real = new Map(args.played.map((m) => [`${m.round}|${pairKey(m.teamA, m.teamB)}`, m]))
  const matches: SwissMatch[] = args.played.filter((m) => m.round < args.fromRound)
  for (let round = args.fromRound; round <= ROUNDS; round++) {
    const records = buildRecords(seeds, matches)
    for (const { teamA, teamB } of args.pairings(round, matches)) {
      const result = real.get(`${round}|${pairKey(teamA, teamB)}`)
      if (result) {
        matches.push(result)
        continue
      }
      const a = records.get(teamA)
      const b = records.get(teamB)
      if (!a || !b) throw new Error(`Unknown team in pairing ${teamA} vs ${teamB}`)
      const winner = play(teamA, teamB, swissMatchFormat(a, b, rules, format))
      matches.push({ round, teamA, teamB, winner })
    }
  }
  return matches
}

/**
 * Monte Carlo of the rest of a Swiss stage. Deterministic for a given input and seed. `onRun`
 * receives every run's full stage (used to chain later stages without touching this stage's draws).
 */
export function simulateSwiss(
  input: SwissSimInput,
  onRun?: (matches: readonly SwissMatch[]) => void,
): SwissSimResult {
  const { seeds, rules, model, veto, runs } = input
  const rng = createRng(input.seed)
  const current = currentRound(seeds, input.played, rules)

  // Check: real results of the current round must match its pairings.
  const currentPairs = current <= ROUNDS ? currentRoundPairs(input, current) : []
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

  const counts = new Map(
    seeds.map((id) => [
      id,
      { p30: 0, adv: 0, p03: 0, elim: 0, records: new Map<string, number>() },
    ]),
  )
  const play = seriesPlayer(model, veto, rng)
  const pairings = (round: number, matches: readonly SwissMatch[]) =>
    round === current ? currentPairs : pairRound(round, input.seeds, matches, input.rules)

  for (let run = 0; run < runs; run++) {
    const matches = playSwissRounds({ ...input, fromRound: current, pairings, play })
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
    onRun?.(matches)
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
      const format = swissMatchFormat(a, b, rules, input.format)
      return {
        round: current,
        teamA: p.teamA,
        teamB: p.teamB,
        format,
        pA: seriesWinChance(p.teamA, p.teamB, format, model, veto),
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

  // Match odds are exact, so only the simulated team odds carry a standard error.
  const probabilities = teams.flatMap((t) => [t.p30, t.pAdvance, t.p03])
  const maxStandardError = Math.max(0, ...probabilities.map((p) => Math.sqrt((p * (1 - p)) / runs)))

  return { currentRound: current, upcoming, teams, runs, maxStandardError }
}
