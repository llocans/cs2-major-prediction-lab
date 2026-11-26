import type { MatchFormat } from '../data/schemas/common.ts'
import type { MatchPrediction, PlayoffTeamOutlook } from '../data/schemas/snapshot.ts'
import { matchReason, matchupConfidence } from './explain.ts'
import { type BracketMatch, roundCount } from './playoffs/bracket.ts'
import {
  type PlayoffSimInput,
  type PlayoffSimResult,
  simulatePlayoffs,
} from './playoffs/simulate-playoffs.ts'
import type { Labels } from './predict.ts'
import { mapSlotRecords } from './series.ts'

export interface PlayoffPrediction {
  sim: PlayoffSimResult
  /** First round with a match still to play; roundCount + 1 once the event is over. */
  currentRound: number
  /** Open matches of the current round, with confidence and reasons. */
  matches: MatchPrediction[]
  teams: PlayoffTeamOutlook[]
  /** Formats used in the bracket whose veto procedure is not verified. */
  unverifiedVeto: MatchFormat[]
}

/** The first round that still has an undecided match, or roundCount + 1 when all are decided. */
export function currentPlayoffRound(bracket: readonly BracketMatch[], rounds: number): number {
  const open = bracket.filter((m) => m.winner === undefined).map((m) => m.round)
  return open.length === 0 ? rounds + 1 : Math.min(...open)
}

/** Runs the playoff simulation and adds confidence levels and short reasons. */
export function predictPlayoffs(input: PlayoffSimInput, labels: Labels): PlayoffPrediction {
  const sim = simulatePlayoffs(input)
  const { model, veto, rules } = input
  const rounds = roundCount(rules)
  const currentRound = currentPlayoffRound(sim.bracket, rounds)

  const matches: MatchPrediction[] = sim.upcoming
    .filter((m) => m.round === currentRound)
    .map((m) => ({
      teamA: m.teamA,
      teamB: m.teamB,
      format: m.format,
      pA: m.pA,
      confidence: matchupConfidence(model, m.teamA, m.teamB, m.pA),
      reason: matchReason(m.teamA, m.teamB, m.format, model, veto, labels.team, labels.map),
      maps: mapSlotRecords(m.teamA, m.teamB, m.format, model, veto),
    }))

  const eliminated = new Set(
    sim.bracket
      .filter((m) => m.winner !== undefined && !m.thirdPlace)
      .map((m) => (m.winner === m.teamA ? m.teamB : m.teamA)),
  )
  const teams: PlayoffTeamOutlook[] = sim.teams.map((odds) => {
    const seed = input.seeds.indexOf(odds.teamId) + 1
    const next = sim.upcoming.find((m) => m.teamA === odds.teamId || m.teamB === odds.teamId)
    const parts = [`seed ${seed}`]
    if (next) {
      const isA = next.teamA === odds.teamId
      const opponent = isA ? next.teamB : next.teamA
      const p = isA ? next.pA : 1 - next.pA
      parts.push(
        `${Math.round(p * 100)}% vs ${labels.team(opponent)} next (${next.format.toUpperCase()})`,
      )
    } else if (eliminated.has(odds.teamId)) {
      parts.push('eliminated')
    }
    return { ...odds, reason: parts.join('; ') }
  })

  const formats = new Set([rules.format.default, rules.format.final])
  if (rules.thirdPlaceDecider) formats.add(rules.format.thirdPlace ?? rules.format.default)
  const unverifiedVeto = [...formats].filter((f) => veto[f]?.unverified === true).sort()

  return { sim, currentRound, matches, teams, unverifiedVeto }
}
