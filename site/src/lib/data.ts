/**
 * Loads the repo's data files at build time and validates them with the same Zod schemas the
 * scripts use. The site never writes data.
 */

import modifiersJson from '../../../data/model/modifiers.json'
import paramsJson from '../../../data/model/params.json'
import ratingsJson from '../../../data/ratings/current.json'
import {
  EventConfig,
  EventResults,
  EventTeams,
  ModelParams,
  Modifiers,
  Ratings,
  TeamForm,
  TeamRegistry,
} from '../../../data/schemas/index.ts'
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
const formFiles = import.meta.glob('../../../data/teams/form/*.json', {
  eager: true,
  import: 'default',
})

export const params = ModelParams.parse(paramsJson)
export const modifiers = Modifiers.parse(modifiersJson).modifiers
export const ratings = Ratings.parse(ratingsJson)
export const registry = TeamRegistry.parse(registryJson)

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
}

const eventDir = (path: string) => path.split('/').at(-2) ?? ''

export const events: EventData[] = Object.entries(configs).map(([path, raw]) => {
  const id = eventDir(path)
  const find = (files: Record<string, unknown>) =>
    Object.entries(files).find(([p]) => eventDir(p) === id)?.[1]
  return {
    config: EventConfig.parse(raw),
    teams: EventTeams.parse(find(teamsFiles)),
    results: EventResults.parse(find(resultsFiles)),
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
