/**
 * Loads the repo's data files at build time and validates them with the same Zod schemas the
 * scripts use. The site never writes data.
 */

import modifiersJson from '../../../data/model/modifiers.json'
import paramsJson from '../../../data/model/params.json'
import ratingsJson from '../../../data/ratings/current.json'
import {
  Benchmarks,
  BookmakerOdds,
  type DrawRound,
  EventConfig,
  EventDraw,
  EventResults,
  EventTeams,
  ModelParams,
  Modifiers,
  Ratings,
  Snapshot,
  type Stage,
  TeamForm,
  TeamRegistry,
  TeamVetoStats,
  teamLogoPaths,
} from '../../../data/schemas/index.ts'
import { SyncStatus } from '../../../data/schemas/sync.ts'
import registryJson from '../../../data/teams/registry.json'
import { stageVersions } from '../../../engine/model-version.ts'

const configs = import.meta.glob('../../../data/events/*/config.json', {
  eager: true,
  import: 'default',
})
const teamsFiles = import.meta.glob('../../../data/events/*/teams.json', {
  eager: true,
  import: 'default',
})
const resultsFiles = import.meta.glob('../../../data/events/*/results.json', {
  eager: true,
  import: 'default',
})
const snapshotFiles = import.meta.glob('../../../data/events/*/snapshots/*.json', {
  eager: true,
  import: 'default',
})
const benchmarkFiles = import.meta.glob('../../../data/events/*/benchmarks.json', {
  eager: true,
  import: 'default',
})
const bookmakerFiles = import.meta.glob('../../../data/events/*/bookmaker-odds.json', {
  eager: true,
  import: 'default',
})
const drawFiles = import.meta.glob('../../../data/events/*/draw.json', {
  eager: true,
  import: 'default',
})
// Written by the poller on every run; local only (gitignored), so it is absent in a static build.
const syncFiles = import.meta.glob('../../../.cache/sync-status.json', {
  eager: true,
  import: 'default',
})
const formFiles = import.meta.glob('../../../data/teams/form/*.json', {
  eager: true,
  import: 'default',
})
const vetoFiles = import.meta.glob('../../../data/teams/vetoes/*.json', {
  eager: true,
  import: 'default',
})
const archivedParamsFiles = import.meta.glob('../../../data/model/archive/*.json', {
  eager: true,
  import: 'default',
})

/** The latest model params (data/model/params.json). */
export const params = ModelParams.parse(paramsJson)
/** Every model version: the latest and the archived ones a stage still runs on or scores alongside. */
export const allParams = [
  params,
  ...Object.values(archivedParamsFiles).map((raw) => ModelParams.parse(raw)),
]

/** The params of the model version a stage runs on (its `model.version`, else the latest). */
export function stageParams(stage: Stage): ModelParams {
  return stageVersions(stage, params, allParams).main
}
export const modifiers = Modifiers.parse(modifiersJson).modifiers
export const ratings = Ratings.parse(ratingsJson)
export const registry = TeamRegistry.parse(registryJson)
/** Teams' pick and ban shares by team ID (data/teams/vetoes/). */
export const vetoStats: Record<string, TeamVetoStats> = Object.fromEntries(
  Object.values(vetoFiles).map((raw) => {
    const stats = TeamVetoStats.parse(raw)
    return [stats.teamId, stats]
  }),
)

/** Status of the automatic result fetching on this machine, if the poller has run here. */
export const syncStatus = (() => {
  const raw = Object.values(syncFiles)[0]
  if (raw === undefined) return undefined
  const parsed = SyncStatus.safeParse(raw)
  return parsed.success ? parsed.data : undefined
})()

export const forms = new Map(
  Object.values(formFiles).map((raw) => {
    const form = TeamForm.parse(raw)
    return [form.teamId, form] as const
  }),
)

export interface EventData {
  config: EventConfig
  teams: EventTeams
  results: EventResults
  /** Predictions saved before each round (never edited). */
  snapshots: Snapshot[]
  /** Market implied probabilities, if any were logged. */
  benchmarks: Benchmarks['entries']
  /** One bookmaker's margin-free prices per round, for the Market odds page. */
  bookmakerOdds: BookmakerOdds['entries']
  /** Swiss draws as announced on the stage page (round 2 on), from the poller. */
  draw: DrawRound[]
}

const eventDir = (path: string) => path.split('/').at(-2) ?? ''

export const events: EventData[] = Object.entries(configs).map(([path, raw]) => {
  const id = eventDir(path)
  const find = (files: Record<string, unknown>) =>
    Object.entries(files).find(([p]) => eventDir(p) === id)?.[1]
  const benchmarks = find(benchmarkFiles)
  const bookmakerOdds = find(bookmakerFiles)
  const draw = find(drawFiles)
  return {
    config: EventConfig.parse(raw),
    teams: EventTeams.parse(find(teamsFiles)),
    results: EventResults.parse(find(resultsFiles)),
    snapshots: Object.entries(snapshotFiles)
      .filter(([p]) => p.split('/').at(-3) === id)
      .map(([, value]) => Snapshot.parse(value)),
    benchmarks: benchmarks ? Benchmarks.parse(benchmarks).entries : [],
    bookmakerOdds: bookmakerOdds ? BookmakerOdds.parse(bookmakerOdds).entries : [],
    draw: draw ? EventDraw.parse(draw).rounds : [],
  }
})

/** The event shown by default: the latest one by first stage date. */
export const currentEvent: EventData = (() => {
  const sorted = [...events].sort((a, b) =>
    (b.config.stages[0]?.start ?? '').localeCompare(a.config.stages[0]?.start ?? ''),
  )
  const first = sorted[0]
  if (!first) throw new Error('No events in data/events')
  return first
})()

export function teamName(event: EventData, teamId: string): string {
  return (
    event.teams.participants.find((p) => p.teamId === teamId)?.displayName ??
    registry.teams.find((t) => t.id === teamId)?.name ??
    teamId
  )
}

/** Short name for tight spots and running text (e.g. "NIP"): the event's own, else Liquipedia's. */
export function teamShortName(event: EventData, teamId: string): string {
  const participant = event.teams.participants.find((p) => p.teamId === teamId)
  return (
    participant?.shortName ??
    registry.teams.find((t) => t.id === teamId)?.shortName?.name ??
    teamName(event, teamId)
  )
}

/**
 * The team's logo files (served from site/public/): the event's own logo for a team renamed for it
 * (e.g. GOSH for BC.Game), else the team's own logo from the registry.
 */
export function teamLogo(
  teamId: string,
  event: EventData = currentEvent,
): { light: string; dark?: string } | undefined {
  const atEvent = event.teams.participants.find((p) => p.teamId === teamId)?.logo
  if (atEvent) return teamLogoPaths(teamId, atEvent, event.teams.eventId)
  return teamLogoPaths(teamId, registry.teams.find((t) => t.id === teamId)?.logo)
}
