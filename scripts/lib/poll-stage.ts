/**
 * What the poller does with one Liquipedia stage page, without the network or git, so the
 * end-to-end checks run exactly the poller's code on made-up pages.
 */
import type { EventConfig, MatchResult, TeamRegistry } from '../../data/schemas/index.ts'
import { type AdvanceOutcome, advanceStage } from './advance.ts'
import { type ConvertOptions, readStagePage } from './liquipedia-results.ts'
import { ensureRoundSnapshot, type LogOutcome, logResults } from './log-results.ts'

/** Liquipedia names → our IDs, through registry.json and the event's map pool. */
export function convertOptions(
  config: EventConfig,
  registry: TeamRegistry,
  stageId: string,
  source: MatchResult['source'],
): ConvertOptions {
  const teamByLiquipedia = new Map(
    registry.teams.filter((t) => t.liquipedia).map((t) => [t.liquipedia?.toLowerCase(), t.id]),
  )
  const mapByName = new Map(config.mapPool.map((map) => [map.name.toLowerCase(), map.id]))
  return {
    stageId,
    resolveTeam: (name) => {
      const id = teamByLiquipedia.get(name.toLowerCase())
      if (!id)
        throw new Error(`Liquipedia team "${name}" has no "liquipedia" entry in registry.json`)
      return id
    },
    resolveMap: (name) => {
      const id = mapByName.get(name.toLowerCase())
      if (!id) throw new Error(`Liquipedia map "${name}" is not in the event map pool`)
      return id
    },
    source,
  }
}

export interface AdvanceStep {
  advance: AdvanceOutcome
  /** The next stage's first-round snapshot, when teams just advanced. */
  snapshot?: LogOutcome['snapshot']
}

/** Seeds the next stage once a Swiss stage is finished, and snapshots its first round. */
export function advanceAndSnapshot(eventId: string, stageId: string): AdvanceStep {
  const advance = advanceStage(eventId, stageId)
  if (advance.status !== 'advanced') return { advance }
  return { advance, snapshot: ensureRoundSnapshot(eventId, advance.nextStageId) }
}

export interface SwissPageOutcome extends LogOutcome {
  next: AdvanceStep
}

/**
 * One Swiss stage page: log new results, save the pre-round snapshot when one is due (with the
 * page's announced pairings), and advance the teams once the stage is finished.
 */
export function applySwissPage(
  eventId: string,
  stageId: string,
  text: string,
  convert: ConvertOptions,
  actor: string,
): SwissPageOutcome {
  const data = readStagePage(text, convert)
  const outcome = logResults(eventId, stageId, data.results, actor, data.announced)
  const snapshot =
    outcome.logged.length > 0
      ? outcome.snapshot
      : ensureRoundSnapshot(eventId, stageId, data.announced)
  return { ...outcome, snapshot, next: advanceAndSnapshot(eventId, stageId) }
}
