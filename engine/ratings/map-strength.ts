import type { MapStrength, ModelParams } from '../../data/schemas/model.ts'

export interface MapSample {
  /** Maps won and played on this map in the window. */
  won: number
  played: number
}

/** Rating points equivalent of a win rate (logistic, `scale` points per 10:1). */
function logit(rate: number, scale: number): number {
  const clamped = Math.min(0.97, Math.max(0.03, rate))
  return scale * Math.log10(clamped / (1 - clamped))
}

export function mapRd(played: number, params: ModelParams): number {
  const { shrinkMaps, newMapRd } = params.maps
  return newMapRd * Math.sqrt(shrinkMaps / (played + shrinkMaps))
}

/**
 * Map offset from research: how much better the team does on this map than on all maps in the same
 * window. The map win rate is shrunk toward the overall rate with `shrinkMaps` pseudo-maps before
 * converting to rating points (docs/model.md, "Map strength").
 */
export function mapStrengthFromSample(
  map: MapSample,
  overall: MapSample,
  params: ModelParams,
): MapStrength {
  const { shrinkMaps, maxOffset } = params.maps
  if (map.played === 0 || overall.played === 0) {
    return { offset: 0, rd: params.maps.newMapRd, n: map.played }
  }
  const overallRate = overall.won / overall.played
  const shrunkRate = (map.won + shrinkMaps * overallRate) / (map.played + shrinkMaps)
  const raw = logit(shrunkRate, params.scale) - logit(overallRate, params.scale)
  const offset = Math.max(-maxOffset, Math.min(maxOffset, raw))
  return { offset: Math.round(offset * 10) / 10, rd: mapRd(map.played, params), n: map.played }
}

/**
 * A map the team did not play once in a large enough sample is most likely its permanent ban:
 * a negative offset with wide uncertainty. Returns undefined when the sample is too small to tell.
 */
export function unplayedMapStrength(
  totalMaps: number,
  params: ModelParams,
): MapStrength | undefined {
  if (totalMaps < params.maps.unplayedMinMaps) return undefined
  return { offset: -params.maps.unplayedPenalty, rd: params.maps.newMapRd, n: 0 }
}
