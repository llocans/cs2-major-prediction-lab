import type { EventData } from '../lib/data.ts'
import { modifiers, params, ratings } from '../lib/data.ts'

/** The model part of every simulation request for an event (see protocol.ts). */
export function modelRequest(event: EventData) {
  return {
    runs: params.sim.runs,
    seed: params.sim.seed,
    ratings,
    modifiers,
    params,
    mapPool: event.config.mapPool.map((m) => m.id),
    veto: event.config.veto,
    today: new Date().toISOString().slice(0, 10),
    teamNames: Object.fromEntries(event.teams.participants.map((p) => [p.teamId, p.displayName])),
    mapNames: Object.fromEntries(event.config.mapPool.map((m) => [m.id, m.name])),
  }
}
