import type { MatchPrediction, TeamOutlook } from '../data/schemas/snapshot.ts'
import {
  LITTLE_DATA_NOTE,
  LITTLE_DATA_RD,
  matchReason,
  matchupConfidence,
  teamConfidence,
} from './explain.ts'
import { type EventChain, type EventSimResult, simulateEvent } from './simulate-event.ts'
import { type SwissSimInput, type SwissSimResult, simulateSwiss } from './simulate-swiss.ts'
import { buildRecords } from './swiss/records.ts'
import type { SwissMatch } from './swiss/types.ts'

export interface StagePrediction {
  sim: SwissSimResult
  matches: MatchPrediction[]
  teams: TeamOutlook[]
  /** Playoff and title odds for the whole event, when the rest of the event was chained. */
  event?: Omit<EventSimResult, 'stage'>
}

export interface Labels {
  team: (teamId: string) => string
  map: (mapId: string) => string
}

/**
 * Runs the stage simulation and adds confidence levels and short reasons. With `chain`, the rest of
 * the event is simulated too and each team gets playoff and title odds; the stage odds are the same
 * either way.
 */
export function predictStage(
  input: SwissSimInput,
  labels: Labels,
  chain?: EventChain,
  /** Receives every run's full stage (e.g. to collect Pick'Em outcomes). */
  onRun?: (matches: readonly SwissMatch[]) => void,
): StagePrediction {
  const chained = chain ? simulateEvent(input, chain, { onStageRun: onRun }) : undefined
  const sim = chained?.stage ?? simulateSwiss(input, onRun)
  const eventOdds = new Map(chained?.teams.map((t) => [t.teamId, t]))
  const { model, veto } = input

  const matches: MatchPrediction[] = sim.upcoming.map((match) => ({
    teamA: match.teamA,
    teamB: match.teamB,
    format: match.format,
    pA: match.pA,
    confidence: matchupConfidence(model, match.teamA, match.teamB, match.pA),
    reason: matchReason(
      match.teamA,
      match.teamB,
      match.format,
      model,
      veto,
      labels.team,
      labels.map,
    ),
  }))

  const records = buildRecords(input.seeds, input.played)
  // Average strength over the map pool: rating + map offsets + active modifiers.
  const average = (team: string) =>
    model.mapPool.reduce((sum, map) => sum + model.strength(team, map), 0) / model.mapPool.length
  const ranked = [...input.seeds].sort((a, b) => average(b) - average(a))
  const teams: TeamOutlook[] = sim.teams.map((odds) => {
    const record = records.get(odds.teamId)
    const next = matches.find((m) => m.teamA === odds.teamId || m.teamB === odds.teamId)
    const parts = [`strength rank ${ranked.indexOf(odds.teamId) + 1} of ${input.seeds.length}`]
    if (next) {
      const isA = next.teamA === odds.teamId
      const opponent = isA ? next.teamB : next.teamA
      const p = isA ? next.pA : 1 - next.pA
      parts.push(
        `${Math.round(p * 100)}% vs ${labels.team(opponent)} next (${next.format.toUpperCase()})`,
      )
    }
    if (model.rd(odds.teamId) >= LITTLE_DATA_RD) parts.push(LITTLE_DATA_NOTE)
    return {
      teamId: odds.teamId,
      record: record ? `${record.wins}-${record.losses}` : '0-0',
      p30: odds.p30,
      pAdvance: odds.pAdvance,
      p03: odds.p03,
      pEliminated: odds.pEliminated,
      ...eventFields(eventOdds.get(odds.teamId)),
      confidence: teamConfidence(model.rd(odds.teamId), odds.pAdvance),
      reason: parts.join('; '),
    }
  })

  if (!chained) return { sim, matches, teams }
  const { stage: _stage, ...event } = chained
  return { sim, matches, teams, event }
}

function eventFields(odds: EventSimResult['teams'][number] | undefined) {
  if (!odds) return {}
  return {
    pPlayoffs: odds.pPlayoffs,
    ...(odds.pTitle !== undefined ? { pTitle: odds.pTitle } : {}),
  }
}
