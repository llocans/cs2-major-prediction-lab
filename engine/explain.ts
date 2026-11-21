import type { MatchFormat } from '../data/schemas/common.ts'
import type { Confidence } from '../data/schemas/snapshot.ts'
import type { MatchModel } from './match-model.ts'
import { expectedSeries, type VetoRules } from './series.ts'

/** Match confidence from combined uncertainty and how far the probability is from 50% (docs/model.md). */
export function matchConfidence(pA: number, sigma: number): Confidence {
  const edge = Math.abs(pA - 0.5)
  if (sigma >= 150 || edge < 0.05) return 'low'
  if (sigma < 110 && edge >= 0.15) return 'high'
  return 'medium'
}

export function teamConfidence(rd: number, pAdvance: number): Confidence {
  if (rd >= 100) return 'low'
  if (rd < 70 && Math.abs(pAdvance - 0.5) >= 0.25) return 'high'
  return 'medium'
}

/** Combined team-level uncertainty of a matchup. */
export function matchupSigma(model: MatchModel, a: string, b: string): number {
  return Math.sqrt(model.rd(a) ** 2 + model.rd(b) ** 2)
}

/**
 * A short reason built from the inputs that move the prediction most: rating gap, likely maps,
 * active modifiers and uncertainty.
 */
export function matchReason(
  a: string,
  b: string,
  format: MatchFormat,
  model: MatchModel,
  veto: VetoRules,
  name: (teamId: string) => string,
  mapName: (mapId: string) => string,
): string {
  const { maps } = expectedSeries(a, b, format, model, veto)
  const parts: string[] = []

  const overall =
    model.mapPool.reduce((sum, map) => sum + model.strength(a, map) - model.strength(b, map), 0) /
    model.mapPool.length
  const favorite = overall >= 0 ? a : b
  parts.push(`${name(favorite)} +${Math.round(Math.abs(overall))} rating on average`)

  const mapList = maps
    .map((map) => `${mapName(map)} ${Math.round(model.mapWin(a, b, map) * 100)}%`)
    .join(', ')
  parts.push(`likely ${maps.length === 1 ? 'map' : 'maps'}: ${mapList} for ${name(a)}`)

  for (const team of [a, b]) {
    for (const modifier of model.modifiersFor(team)) {
      parts.push(
        `${name(team)} ${modifier.delta > 0 ? '+' : ''}${modifier.delta}: ${modifier.reason}`,
      )
    }
  }
  if (model.rd(a) >= 100 || model.rd(b) >= 100) {
    const unsure = [a, b].filter((team) => model.rd(team) >= 100).map(name)
    parts.push(`little tier-1 data for ${unsure.join(' and ')}`)
  }
  return parts.join('; ')
}
