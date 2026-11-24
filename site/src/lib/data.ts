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
  EventConfig,
  EventResults,
  EventTeams,
  ModelParams,
  Modifiers,
  Ratings,
  Snapshot,
  TeamForm,
  TeamRegistry,
} from '../../../data/schemas/index.ts'
import { SyncStatus } from '../../../data/schemas/sync.ts'
import registryJson from '../../../data/teams/registry.json'

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
// Written by the poller on every run; local only (gitignored), so it is absent in a static build.
const syncFiles = import.meta.glob('../../../.cache/sync-status.json', {
  eager: true,
  import: 'default',
})
const formFiles = import.meta.glob('../../../data/teams/form/*.json', {
  eager: true,
  import: 'default',
})

export const params = ModelParams.parse(paramsJson)
export const modifiers = Modifiers.parse(modifiersJson).modifiers
export const ratings = Ratings.parse(ratingsJson)
export const registry = TeamRegistry.parse(registryJson)

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
}

const eventDir = (path: string) => path.split('/').at(-2) ?? ''

export const events: EventData[] = Object.entries(configs).map(([path, raw]) => {
  const id = eventDir(path)
  const find = (files: Record<string, unknown>) =>
    Object.entries(files).find(([p]) => eventDir(p) === id)?.[1]
  const benchmarks = find(benchmarkFiles)
  const bookmakerOdds = find(bookmakerFiles)
  return {
    config: EventConfig.parse(raw),
    teams: EventTeams.parse(find(teamsFiles)),
    results: EventResults.parse(find(resultsFiles)),
    snapshots: Object.entries(snapshotFiles)
      .filter(([p]) => p.split('/').at(-3) === id)
      .map(([, value]) => Snapshot.parse(value)),
    benchmarks: benchmarks ? Benchmarks.parse(benchmarks).entries : [],
    bookmakerOdds: bookmakerOdds ? BookmakerOdds.parse(bookmakerOdds).entries : [],
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
