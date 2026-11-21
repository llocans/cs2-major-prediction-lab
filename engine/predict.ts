import type { MatchPrediction, TeamOutlook } from '../data/schemas/snapshot.ts'
import { matchConfidence, matchReason, matchupSigma, teamConfidence } from './explain.ts'
import { type SwissSimInput, type SwissSimResult, simulateSwiss } from './simulate-swiss.ts'
import { buildRecords } from './swiss/records.ts'

export interface StagePrediction {
  sim: SwissSimResult
  matches: MatchPrediction[]
  teams: TeamOutlook[]
}

export interface Labels {
  team: (teamId: string) => string
  map: (mapId: string) => string
}

/** Runs the stage simulation and adds confidence levels and short reasons. */
export function predictStage(input: SwissSimInput, labels: Labels): StagePrediction {
  const sim = simulateSwiss(input)
  const { model, veto } = input

  const matches: MatchPrediction[] = sim.upcoming.map((match) => ({
    teamA: match.teamA,
    teamB: match.teamB,
    format: match.format,
    pA: match.pA,
    confidence: matchConfidence(match.pA, matchupSigma(model, match.teamA, match.teamB)),
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
    if (model.rd(odds.teamId) >= 100) parts.push('little tier-1 data')
    return {
      teamId: odds.teamId,
      record: record ? `${record.wins}-${record.losses}` : '0-0',
      p30: odds.p30,
      pAdvance: odds.pAdvance,
      p03: odds.p03,
      pEliminated: odds.pEliminated,
      confidence: teamConfidence(model.rd(odds.teamId), odds.pAdvance),
      reason: parts.join('; '),
    }
  })

  return { sim, matches, teams }
}
