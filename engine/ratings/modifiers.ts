import type { MapId } from '../../data/schemas/common.ts'
import type { Modifier } from '../../data/schemas/model.ts'

/** Modifiers that apply on `date` (createdAt <= date <= expires). */
export function activeModifiers(modifiers: readonly Modifier[], date: string): Modifier[] {
  return modifiers.filter((modifier) => modifier.createdAt <= date && date <= modifier.expires)
}

/**
 * Total modifier for a team on a map, clamped to ±maxAbs. The single definition used both for
 * predictions and for rating updates, so an update judges a result against what was predicted.
 */
export function modifierDelta(
  active: readonly Modifier[],
  teamId: string,
  map: MapId,
  maxAbs: number,
): number {
  const total = active
    .filter((m) => m.teamId === teamId && (m.map === undefined || m.map === map))
    .reduce((sum, m) => sum + m.delta, 0)
  return Math.max(-maxAbs, Math.min(maxAbs, total))
}
