/**
 * Loads and validates everything needed to simulate one Swiss stage of an event.
 * The single place where scripts turn data files into engine inputs.
 */
import { existsSync } from 'node:fs'
import {
  EventConfig,
  EventResults,
  EventTeams,
  type ModelParams,
  Modifiers,
  type PlayoffStage,
  type SwissStage,
  TeamRegistry,
} from '../../data/schemas/index.ts'
import { buildEventChain } from '../../engine/event-chain.ts'
import { buildMatchModel, type MatchModel } from '../../engine/match-model.ts'
import type { PlayoffSimInput } from '../../engine/playoffs/simulate-playoffs.ts'
import type { Labels } from '../../engine/predict.ts'
import type { EventChain } from '../../engine/simulate-event.ts'
import type { SwissSimInput } from '../../engine/simulate-swiss.ts'
import { stageSeeds } from '../../engine/swiss/stage-seeds.ts'
import type { Pairing, SwissMatch } from '../../engine/swiss/types.ts'
import { readJson, repoPath } from './files.ts'
import { loadParams, loadStageVersions } from './model-versions.ts'
import { loadRatings } from './ratings-store.ts'

/** "main": the stage's own model version; "alongside": an older version scored next to it. */
export type ModelRole = 'main' | 'alongside'

export interface StageContext {
  eventId: string
  config: EventConfig
  stage: SwissStage
  results: EventResults
  params: ModelParams
  modelRole: ModelRole
  simInput: SwissSimInput
  /**
   * The rest of the event after this stage, for playoff and title odds. Undefined (with a warning)
   * if the later stages are misconfigured, so results and stage odds never depend on them.
   */
  chain?: EventChain
  labels: Labels
  ratingsAsOf: string
}

/** Everything about an event that does not depend on the stage. */
export interface EventData {
  config: EventConfig
  teams: EventTeams
  results: EventResults
  params: ModelParams
  model: MatchModel
  labels: Labels
  ratingsAsOf: string
}

/**
 * Loads and validates the event's config, teams, results, model parameters and ratings. `version`
 * picks the model params (default: the latest, data/model/params.json).
 */
export function loadEventData(eventId: string, today?: string, version?: string): EventData {
  const dir = repoPath('data/events', eventId)
  const config = readJson(`${dir}/config.json`, EventConfig)
  const teams = readJson(`${dir}/teams.json`, EventTeams)
  const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
  const results = readJson(`${dir}/results.json`, EventResults)
  const params = loadParams(version)
  const modifiersPath = repoPath('data/model/modifiers.json')
  const modifiers = existsSync(modifiersPath) ? readJson(modifiersPath, Modifiers).modifiers : []
  const ratings = loadRatings()
  const model = buildMatchModel(
    ratings,
    modifiers,
    params,
    config.mapPool.map((map) => map.id),
    today ?? new Date().toISOString().slice(0, 10),
  )
  const displayNames = new Map(teams.participants.map((p) => [p.teamId, p.displayName]))
  const mapNames = new Map(config.mapPool.map((map) => [map.id, map.name]))
  const labels: Labels = {
    team: (id) => displayNames.get(id) ?? registry.teams.find((t) => t.id === id)?.name ?? id,
    map: (id) => mapNames.get(id) ?? id,
  }
  return { config, teams, results, params, model, labels, ratingsAsOf: ratings.asOf }
}

export function loadStageContext(
  eventId: string,
  stageId: string,
  /** `version`: a model version other than the stage's own (an alongside version, a replay). */
  options: { announced?: Pairing[]; today?: string; version?: string } = {},
): StageContext {
  const { version, modelRole } = resolveVersion(eventId, stageId, options.version)
  const event = loadEventData(eventId, options.today, version)
  const { config, teams, results, params, model, labels } = event
  const stage = config.stages.find((s) => s.id === stageId)
  if (stage?.type !== 'swiss') throw new Error(`${eventId}: no Swiss stage "${stageId}"`)

  const seeds = stageSeeds(teams.participants, stageId)
  if (seeds.length !== stage.teamCount) {
    throw new Error(`${stageId}: expected ${stage.teamCount} seeded teams, found ${seeds.length}`)
  }

  const played: SwissMatch[] = results.matches
    .filter((m) => m.stageId === stageId)
    .map((m) => ({ round: m.round, teamA: m.teamA, teamB: m.teamB, winner: m.winner }))

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

  const chain = laterStages(config, teams.participants, stageId, seeds)
  return {
    eventId,
    config,
    stage,
    results,
    params,
    modelRole,
    simInput,
    ...(chain ? { chain } : {}),
    labels,
    ratingsAsOf: event.ratingsAsOf,
  }
}

/** The event chain after this stage, or undefined with a warning when it cannot be built. */
function laterStages(
  config: EventConfig,
  participants: EventTeams['participants'],
  stageId: string,
  seeds: readonly string[],
): EventChain | undefined {
  try {
    const chain = buildEventChain(config, participants, stageId)
    const teams = [...seeds, ...chain.next.flatMap((stage) => stage.invited)]
    const twice = teams.filter((team, index) => teams.indexOf(team) !== index)
    if (twice.length > 0) throw new Error(`teams in more than one stage: ${twice.join(', ')}`)
    return chain
  } catch (error) {
    console.warn(`${config.id}: no playoff/title odds (${String(error)})`)
    return undefined
  }
}

export interface PlayoffContext {
  eventId: string
  config: EventConfig
  stage: PlayoffStage
  results: EventResults
  params: ModelParams
  modelRole: ModelRole
  simInput: PlayoffSimInput
  labels: Labels
  ratingsAsOf: string
}

/** True once the playoff stage has all its seeds (written by the stage advance). */
export function isPlayoffStageSeeded(event: EventData, stage: PlayoffStage): boolean {
  return stageSeeds(event.teams.participants, stage.id).length === stage.bracket.length * 2
}

/** Loads everything needed to simulate a single-elimination stage. Throws until it is seeded. */
export function loadPlayoffContext(
  eventId: string,
  stageId: string,
  options: { today?: string; version?: string } = {},
): PlayoffContext {
  const { version, modelRole } = resolveVersion(eventId, stageId, options.version)
  const event = loadEventData(eventId, options.today, version)
  const { config, teams, results, params, model, labels } = event
  const stage = config.stages.find((s) => s.id === stageId)
  if (stage?.type !== 'single-elimination') {
    throw new Error(`${eventId}: no single-elimination stage "${stageId}"`)
  }
  const seeds = stageSeeds(teams.participants, stageId)
  if (!isPlayoffStageSeeded(event, stage)) {
    throw new Error(`${stageId}: expected ${stage.bracket.length * 2} seeds, found ${seeds.length}`)
  }
  const played = results.matches
    .filter((m) => m.stageId === stageId)
    .map((m) => ({ teamA: m.teamA, teamB: m.teamB, winner: m.winner }))
  return {
    eventId,
    config,
    stage,
    results,
    params,
    modelRole,
    simInput: {
      seeds,
      rules: stage,
      veto: config.veto,
      model,
      played,
      runs: params.sim.runs,
      seed: params.sim.seed,
    },
    labels,
    ratingsAsOf: event.ratingsAsOf,
  }
}

/**
 * The model version to load for a stage: its own (main) version by default; another version must be
 * one of the stage's alongside versions, or be asked for explicitly as a replay (role "alongside").
 */
function resolveVersion(
  eventId: string,
  stageId: string,
  requested: string | undefined,
): { version: string; modelRole: ModelRole } {
  const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
  const { main } = loadStageVersions(config, stageId)
  if (requested === undefined || requested === main.version) {
    return { version: main.version, modelRole: 'main' }
  }
  return { version: requested, modelRole: 'alongside' }
}
