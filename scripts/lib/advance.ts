/**
 * Moves the teams that advanced from a finished Swiss stage into the next stage's seeds
 * (Valve: invited teams are seeds 1-8, advancing teams 9-16 in their final mid-stage seed order).
 */
import { EventConfig, EventResults, EventTeams } from '../../data/schemas/index.ts'
import { currentRound } from '../../engine/simulate-swiss.ts'
import { stageSeeds } from '../../engine/swiss/stage-seeds.ts'
import { advancingTeams } from '../../engine/swiss/standings.ts'
import { readJson, repoPath, writeJson } from './files.ts'

export type AdvanceOutcome =
  | { status: 'advanced'; nextStageId: string; teams: string[] }
  | { status: 'already'; nextStageId: string }
  | { status: 'not-finished' | 'no-next-stage' }

/** True once all of the stage's teams are known (entry seeds plus advanced seeds). */
export function isSwissStageSeeded(eventId: string, stageId: string): boolean {
  const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
  const stage = config.stages.find((s) => s.id === stageId)
  if (stage?.type !== 'swiss') return false
  const teams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
  return stageSeeds(teams.participants, stageId).length >= stage.teamCount
}

export function isSwissStageFinished(eventId: string, stageId: string): boolean {
  const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
  const stage = config.stages.find((s) => s.id === stageId)
  if (stage?.type !== 'swiss') return false
  const teams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
  const seeds = stageSeeds(teams.participants, stageId)
  if (seeds.length < stage.teamCount) return false
  const played = readJson(
    repoPath('data/events', eventId, 'results.json'),
    EventResults,
  ).matches.filter((m) => m.stageId === stageId)
  return currentRound(seeds, played, stage) > 5
}

export function advanceStage(eventId: string, stageId: string): AdvanceOutcome {
  const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
  const stage = config.stages.find((s) => s.id === stageId)
  if (stage?.type !== 'swiss') throw new Error(`${eventId}: no Swiss stage "${stageId}"`)
  const nextStageId = stage.advanceTo
  if (!nextStageId) return { status: 'no-next-stage' }
  if (!isSwissStageFinished(eventId, stageId)) return { status: 'not-finished' }

  const teamsPath = repoPath('data/events', eventId, 'teams.json')
  const teams = readJson(teamsPath, EventTeams)
  if (teams.participants.some((p) => p.advancedSeeds?.[nextStageId] !== undefined)) {
    return { status: 'already', nextStageId }
  }

  const results = readJson(repoPath('data/events', eventId, 'results.json'), EventResults)
  const played = results.matches.filter((m) => m.stageId === stageId)
  const advanced = advancingTeams(stageSeeds(teams.participants, stageId), played, stage)
  const invited = teams.participants.filter((p) => p.entryStage === nextStageId).length

  const participants = teams.participants.map((p) => {
    const index = advanced.indexOf(p.teamId)
    if (index === -1) return p
    return { ...p, advancedSeeds: { ...p.advancedSeeds, [nextStageId]: invited + index + 1 } }
  })
  writeJson(teamsPath, EventTeams, { ...teams, participants })
  return { status: 'advanced', nextStageId, teams: advanced }
}
