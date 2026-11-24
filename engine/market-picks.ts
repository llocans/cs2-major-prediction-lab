import type { BookmakerOdds } from '../data/schemas/bookmaker-odds.ts'
import type { MatchFormat } from '../data/schemas/common.ts'
import type { MatchResult } from '../data/schemas/results.ts'
import type { Confidence, Snapshot } from '../data/schemas/snapshot.ts'
import { LITTLE_DATA_NOTE } from './explain.ts'

/**
 * The model's picks against one bookmaker's prices: back a side when the model gives it at least
 * MIN_EDGE more than the margin-free market does. A fixed rule, so the record is not hand-picked.
 * Benchmark only: the model never reads market odds.
 */
export const MIN_EDGE = 0.05

/** Margin-free chance that A wins from two decimal odds (each implied probability scaled to sum 1). */
export function marginFree(oddsA: number, oddsB: number): number {
  if (!(oddsA > 1 && oddsB > 1))
    throw new Error(`Decimal odds must be above 1 (got ${oddsA}, ${oddsB})`)
  const a = 1 / oddsA
  const b = 1 / oddsB
  return a / (a + b)
}

/**
 * Why a match has no pick: no odds logged, the edge is under MIN_EDGE, or the model flags little
 * tier-1 data for a team (it then pulls toward 50%, its known blind spot).
 */
export type SkipReason = 'no-odds' | 'small-edge' | 'little-data'

export interface MarketMatch {
  teamA: string
  teamB: string
  format: MatchFormat
  confidence: Confidence
  reason: string
  /** The model's chance for teamA, from the snapshot saved before the round. */
  modelA: number
  /** The market's margin-free chance for teamA, if odds were logged. */
  marketA?: number
  /** The side the model rates above the market, and by how much (probability units). */
  edge?: { team: string; value: number }
  pick?: string
  skip?: SkipReason
  /** Winner and score from the winner's side: rounds for one map, maps for a series. */
  result?: { winner: string; score: string }
  /** Set once a picked match is played. */
  pickWon?: boolean
}

export interface Tally {
  picks: number
  won: number
  lost: number
  pending: number
}

export interface MarketRound extends Tally {
  round: number
  /** The latest day the round's odds were read. */
  readOn?: string
  sources: string[]
  matches: MarketMatch[]
}

export interface MarketStage extends Tally {
  stageId: string
  rounds: MarketRound[]
}

type OddsEntry = BookmakerOdds['entries'][number]

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function seriesScore(result: MatchResult): string {
  const winnerIsA = result.winner === result.teamA
  if (result.maps.length === 1) {
    const [map] = result.maps
    if (!map) return ''
    return winnerIsA ? `${map.scoreA}-${map.scoreB}` : `${map.scoreB}-${map.scoreA}`
  }
  const winsA = result.maps.filter((m) => m.scoreA > m.scoreB).length
  const winsB = result.maps.length - winsA
  return winnerIsA ? `${winsA}-${winsB}` : `${winsB}-${winsA}`
}

function tally(matches: readonly MarketMatch[]): Tally {
  const picked = matches.filter((m) => m.pick !== undefined)
  return {
    picks: picked.length,
    won: picked.filter((m) => m.pickWon === true).length,
    lost: picked.filter((m) => m.pickWon === false).length,
    pending: picked.filter((m) => m.pickWon === undefined).length,
  }
}

/** Every round of a stage that has logged odds, oldest first, with the stage totals. */
export function stageMarketPicks(
  stageId: string,
  snapshots: readonly Snapshot[],
  odds: readonly OddsEntry[],
  results: readonly MatchResult[],
): MarketStage {
  const stageOdds = odds.filter((o) => o.stageId === stageId)
  const rounds = snapshots
    .filter((s) => s.stageId === stageId && stageOdds.some((o) => o.round === s.beforeRound))
    .sort((a, b) => a.beforeRound - b.beforeRound)
    .map((snapshot): MarketRound => {
      const round = snapshot.beforeRound
      const roundOdds = stageOdds.filter((o) => o.round === round)
      const matches = snapshot.matches.map((prediction): MarketMatch => {
        const key = pairKey(prediction.teamA, prediction.teamB)
        const entry = roundOdds.find((o) => pairKey(o.teamA, o.teamB) === key)
        const result = results.find(
          (r) => r.stageId === stageId && r.round === round && pairKey(r.teamA, r.teamB) === key,
        )
        const match: MarketMatch = {
          teamA: prediction.teamA,
          teamB: prediction.teamB,
          format: prediction.format,
          confidence: prediction.confidence,
          reason: prediction.reason,
          modelA: prediction.pA,
          ...(result ? { result: { winner: result.winner, score: seriesScore(result) } } : {}),
        }
        if (!entry) return { ...match, skip: 'no-odds' }
        const marketA = entry.teamA === prediction.teamA ? entry.pA : 1 - entry.pA
        const edgeA = prediction.pA - marketA
        const edge = {
          team: edgeA >= 0 ? prediction.teamA : prediction.teamB,
          value: Math.abs(edgeA),
        }
        const priced = { ...match, marketA, edge }
        // A small tolerance so an edge that prints as 5.0 pp counts as 5 pp.
        if (edge.value < MIN_EDGE - 1e-9) return { ...priced, skip: 'small-edge' }
        if (prediction.reason.includes(LITTLE_DATA_NOTE)) return { ...priced, skip: 'little-data' }
        return {
          ...priced,
          pick: edge.team,
          ...(result ? { pickWon: result.winner === edge.team } : {}),
        }
      })
      const readOn = roundOdds
        .map((o) => o.source.retrievedAt)
        .sort()
        .at(-1)
      return {
        round,
        ...(readOn ? { readOn } : {}),
        sources: [...new Set(roundOdds.map((o) => o.source.name))],
        matches,
        ...tally(matches),
      }
    })
  return { stageId, rounds, ...tally(rounds.flatMap((r) => r.matches)) }
}
