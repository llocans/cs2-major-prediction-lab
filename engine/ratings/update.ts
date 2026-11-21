import type { MapId, MatchFormat } from '../../data/schemas/common.ts'
import type { ModelParams, Modifier, Ratings, TeamRating } from '../../data/schemas/model.ts'
import { mapRd } from './map-strength.ts'
import { modifierDelta } from './modifiers.ts'
import { uncertaintyFactor, winProbability } from './probability.ts'

export interface RatedMatch {
  teamA: string
  teamB: string
  format: MatchFormat
  /** Maps in play order, scores from teamA's side. */
  maps: ReadonlyArray<{ map: MapId; scoreA: number; scoreB: number }>
}

/**
 * Updates ratings after a real match, map by map (docs/model.md, "Rating updates").
 * The expected result includes the modifiers active at the match, exactly as the prediction did,
 * so a result is judged against what was actually predicted. Modifiers themselves never change.
 * Pure: returns a new Ratings object and leaves the input untouched.
 */
export function updateRatings(
  ratings: Ratings,
  match: RatedMatch,
  params: ModelParams,
  asOf: string,
  reason: string,
  modifiers: readonly Modifier[] = [],
): Ratings {
  const teams: Record<string, TeamRating> = structuredClone(ratings.teams)
  const a = teams[match.teamA]
  const b = teams[match.teamB]
  if (!a || !b) throw new Error(`No rating for ${a ? match.teamB : match.teamA}`)

  const { k, formatWeight, roundDiffWeight, minRd } = params.update
  const q = Math.log(10) / params.scale

  for (const played of match.maps) {
    const mapA = a.maps[played.map] ?? { offset: 0, rd: params.maps.newMapRd, n: 0 }
    const mapB = b.maps[played.map] ?? { offset: 0, rd: params.maps.newMapRd, n: 0 }
    const cap = params.modifiers.maxAbs
    const gap =
      a.rating +
      mapA.offset +
      modifierDelta(modifiers, match.teamA, played.map, cap) -
      (b.rating + mapB.offset + modifierDelta(modifiers, match.teamB, played.map, cap))
    const variance = a.rd ** 2 + b.rd ** 2 + mapA.rd ** 2 + mapB.rd ** 2
    const expected = winProbability(gap, variance, params.scale)
    const score = played.scoreA > played.scoreB ? 1 : 0
    const surprise = score - expected

    const diff = Math.min(Math.abs(played.scoreA - played.scoreB), 13)
    const margin = 1 + roundDiffWeight * (diff / 13 - 0.5)
    const base = k * formatWeight[match.format] * margin
    const kA = base * (a.rd / params.prior.rd) ** 2
    const kB = base * (b.rd / params.prior.rd) ** 2

    a.rating += kA * surprise
    b.rating -= kB * surprise
    a.maps[played.map] = nextMap(mapA, 0.5 * kA * surprise, params)
    b.maps[played.map] = nextMap(mapB, -0.5 * kB * surprise, params)

    const information = expected * (1 - expected)
    const gA = uncertaintyFactor(b.rd, params.scale)
    const gB = uncertaintyFactor(a.rd, params.scale)
    a.rd = Math.max(minRd, 1 / Math.sqrt(1 / a.rd ** 2 + q * q * gA * gA * information))
    b.rd = Math.max(minRd, 1 / Math.sqrt(1 / b.rd ** 2 + q * q * gB * gB * information))
  }

  for (const team of [a, b]) {
    team.rating = round1(team.rating)
    team.rd = round1(team.rd)
  }
  return { schemaVersion: 1, asOf, reason, teams }
}

function nextMap(
  current: { offset: number; rd: number; n: number },
  step: number,
  params: ModelParams,
): { offset: number; rd: number; n: number } {
  const weight = (current.rd / params.maps.newMapRd) ** 2
  const offset = Math.max(
    -params.maps.maxOffset,
    Math.min(params.maps.maxOffset, current.offset + step * weight),
  )
  const n = current.n + 1
  return { offset: round1(offset), rd: round1(mapRd(n, params)), n }
}

const round1 = (value: number) => Math.round(value * 10) / 10
