/**
 * Loads and validates everything needed to simulate one Swiss stage of an event.
 * The single place where scripts turn data files into engine inputs.
 */
import { existsSync } from 'node:fs'
import {
  EventConfig,
  EventResults,
  EventTeams,
  ModelParams,
  Modifiers,
  type SwissStage,
  TeamRegistry,
} from '../../data/schemas/index.ts'
import { buildMatchModel } from '../../engine/match-model.ts'
import type { Labels } from '../../engine/predict.ts'
import type { SwissSimInput } from '../../engine/simulate-swiss.ts'
import { stageSeeds } from '../../engine/swiss/stage-seeds.ts'
import type { Pairing, SwissMatch } from '../../engine/swiss/types.ts'
import { readJson, repoPath } from './files.ts'
import { loadRatings } from './ratings-store.ts'

export interface StageContext {
  eventId: string
  config: EventConfig
  stage: SwissStage
  results: EventResults
  params: ModelParams
  simInput: SwissSimInput
  labels: Labels
  ratingsAsOf: string
}

export function loadStageContext(
  eventId: string,
  stageId: string,
  options: { announced?: Pairing[]; today?: string } = {},
): StageContext {
  const dir = repoPath('data/events', eventId)
  const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
  const stage = config.stages.find((s) => s.id === stageId)
  if (stage?.type !== 'swiss') throw new Error(`${eventId}: no Swiss stage "${stageId}"`)

  const teams = readJson(`${dir}/teams.json`, EventTeams)
  const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
  const results = readJson(`${dir}/results.json`, EventResults)
  const params = readJson(repoPath('data/model/params.json'), ModelParams)
  const modifiersPath = repoPath('data/model/modifiers.json')
  const modifiers = existsSync(modifiersPath) ? readJson(modifiersPath, Modifiers).modifiers : []
  const ratings = loadRatings()

  const seeds = stageSeeds(teams.participants, stageId)
  if (seeds.length !== stage.teamCount) {
    throw new Error(`${stageId}: expected ${stage.teamCount} seeded teams, found ${seeds.length}`)
  }

  const played: SwissMatch[] = results.matches
    .filter((m) => m.stageId === stageId)
    .map((m) => ({ round: m.round, teamA: m.teamA, teamB: m.teamB, winner: m.winner }))

  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const model = buildMatchModel(
    ratings,
    modifiers,
    params,
    config.mapPool.map((map) => map.id),
    today,
  )

  const displayNames = new Map(teams.participants.map((p) => [p.teamId, p.displayName]))
  const mapNames = new Map(config.mapPool.map((map) => [map.id, map.name]))
  const labels: Labels = {
    team: (id) => displayNames.get(id) ?? registry.teams.find((t) => t.id === id)?.name ?? id,
    map: (id) => mapNames.get(id) ?? id,
  }

  const simInput: SwissSimInput = {
    seeds,
    rules: {
      winsToAdvance: stage.winsToAdvance,
      lossesToEliminate: stage.lossesToEliminate,
      initialPairing: stage.initialPairing,
    },
    format: stage.format,
    veto: config.veto,
    model,
    played,
    runs: params.sim.runs,
    seed: params.sim.seed,
  }
  if (options.announced) simInput.announced = options.announced

  return { eventId, config, stage, results, params, simInput, labels, ratingsAsOf: ratings.asOf }
}
