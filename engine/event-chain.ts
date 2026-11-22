import type { EventConfig, Stage } from '../data/schemas/event-config.ts'
import type { EventParticipant } from '../data/schemas/event-teams.ts'
import type { ChainSwissStage, EventChain } from './simulate-event.ts'

/**
 * The rest of the event after `currentStageId`, from the event config: the next Swiss stages (via
 * `advanceTo`) with their directly invited teams, then the playoffs. Playoffs are left out when the
 * config has no veto procedure for one of their formats, so title odds are simply not reported.
 */
export function buildEventChain(
  config: Pick<EventConfig, 'stages' | 'veto'>,
  participants: readonly EventParticipant[],
  currentStageId: string,
): EventChain {
  const byId = new Map(config.stages.map((stage) => [stage.id, stage]))
  const next: ChainSwissStage[] = []
  let playoffs: EventChain['playoffs']
  let stage: Stage | undefined = byId.get(currentStageId)
  if (stage?.type !== 'swiss') throw new Error(`No Swiss stage "${currentStageId}" in the config`)
  const seen = new Set([stage.id])

  while (stage?.type === 'swiss' && stage.advanceTo) {
    const nextId: string = stage.advanceTo
    if (seen.has(nextId)) throw new Error(`Stage chain loops at "${nextId}"`)
    seen.add(nextId)
    const following = byId.get(nextId)
    if (!following) throw new Error(`Stage "${stage.id}" advances to unknown stage "${nextId}"`)
    if (following.type === 'single-elimination') {
      const formats = [following.format.default, following.format.final]
      if (following.thirdPlaceDecider) {
        formats.push(following.format.thirdPlace ?? following.format.default)
      }
      if (formats.every((format) => config.veto[format] !== undefined)) {
        playoffs = { rules: following }
      }
      break
    }
    const invited = participants
      .filter((p) => p.entryStage === following.id)
      .sort((a, b) => a.stageSeed - b.stageSeed)
      .map((p) => p.teamId)
    next.push({
      id: following.id,
      rules: {
        winsToAdvance: following.winsToAdvance,
        lossesToEliminate: following.lossesToEliminate,
        initialPairing: following.initialPairing,
      },
      format: following.format,
      invited,
    })
    stage = following
  }
  return playoffs ? { next, playoffs } : { next }
}
