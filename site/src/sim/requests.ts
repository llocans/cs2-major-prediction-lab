import type { Stage } from '../../../data/schemas/index.ts'
import type { EventData } from '../lib/data.ts'
import { modifiers, ratings, stageParams, vetoStats } from '../lib/data.ts'

/**
 * The model part of every simulation request for an event (see protocol.ts), with the params of the
 * model version `stage` runs on, so the site shows the same odds as that stage's snapshots.
 */
export function modelRequest(event: EventData, stage: Stage) {
  const params = stageParams(stage)
  return {
    runs: params.sim.runs,
    seed: params.sim.seed,
    ratings,
    modifiers,
    params,
    vetoStats,
    mapPool: event.config.mapPool.map((m) => m.id),
    veto: event.config.veto,
    today: new Date().toISOString().slice(0, 10),
    teamNames: Object.fromEntries(event.teams.participants.map((p) => [p.teamId, p.displayName])),
    mapNames: Object.fromEntries(event.config.mapPool.map((m) => [m.id, m.name])),
  }
}
