import type { MatchFormat } from '../data/schemas/common.ts'
import type { MatchResult } from '../data/schemas/results.ts'
import type { Benchmarks, Confidence, MatchPrediction, Snapshot } from '../data/schemas/snapshot.ts'
import { brierScore, type CalibrationBin, calibration, hitRate, type Scored } from './scoring.ts'

/** A winner we gave less than this is an upset. */
export const UPSET_BELOW = 0.4

export interface TrackedMatch {
  round: number
  teamA: string
  teamB: string
  format: MatchFormat
  /** Our probability that teamA wins, from the snapshot saved before the round. */
  pA: number
  confidence: Confidence
  reason: string
  winner: string
  /** Probability we gave the actual winner. */
  pWinner: number
  /** The side we favoured won (exact 50% counts as a miss). */
  hit: boolean
  /** Squared error of this prediction (0 = perfect, 0.25 = coin flip). */
  brier: number
  upset: boolean
  /** Market implied probability for teamA, if logged in benchmarks.json. */
  marketPA?: number
}

export interface RoundRecord {
  round: number
  /** When the round's snapshot was saved. */
  savedAt: string
  matches: TrackedMatch[]
  /** Predictions of this round without a result yet. */
  pendingMatches: MatchPrediction[]
  hits: number
  /** Mean Brier of the played matches; undefined until one is played. */
  brier?: number
}

export interface StageTrackRecord {
  stageId: string
  snapshotRounds: number[]
  rounds: RoundRecord[]
  /** Predicted matches without a result yet. */
  pending: number
  brier?: number
  hitRate?: number
  calibration: CalibrationBin[]
  upsets: TrackedMatch[]
  market?: { matches: number; model: number; market: number }
  /** Pre-stage advance odds vs who advanced; only once the stage is complete. */
  advance?: { brier: number; teams: Array<{ teamId: string; p: number; advanced: boolean }> }
}

const pairKey = (round: number, a: string, b: string) => `${round}|${[a, b].sort().join('|')}`

/**
 * Compares a stage's saved snapshots with real results. Pure: the caller loads the files.
 * `advanced` is the set of teams that advanced, passed only when the stage is complete.
 */
export function stageTrackRecord(
  stageId: string,
  snapshots: readonly Snapshot[],
  results: readonly MatchResult[],
  benchmarks: Benchmarks['entries'] = [],
  advanced?: ReadonlySet<string>,
): StageTrackRecord {
  const ordered = snapshots
    .filter((s) => s.stageId === stageId)
    .sort((a, b) => a.beforeRound - b.beforeRound)
  const resultByKey = new Map(
    results
      .filter((m) => m.stageId === stageId)
      .map((m) => [pairKey(m.round, m.teamA, m.teamB), m]),
  )

  let pending = 0
  const rounds: RoundRecord[] = []
  for (const snapshot of ordered) {
    const matches: TrackedMatch[] = []
    const pendingMatches: MatchPrediction[] = []
    for (const prediction of snapshot.matches) {
      const key = pairKey(snapshot.beforeRound, prediction.teamA, prediction.teamB)
      const result = resultByKey.get(key)
      if (!result) {
        pending++
        pendingMatches.push(prediction)
        continue
      }
      const aWon = result.winner === prediction.teamA
      const pWinner = aWon ? prediction.pA : 1 - prediction.pA
      const market = benchmarks.find(
        (b) => b.stageId === stageId && pairKey(b.round, b.teamA, b.teamB) === key,
      )
      const tracked: TrackedMatch = {
        round: snapshot.beforeRound,
        teamA: prediction.teamA,
        teamB: prediction.teamB,
        format: prediction.format,
        pA: prediction.pA,
        confidence: prediction.confidence,
        reason: prediction.reason,
        winner: result.winner,
        pWinner,
        hit: pWinner > 0.5,
        brier: (prediction.pA - (aWon ? 1 : 0)) ** 2,
        upset: pWinner < UPSET_BELOW,
      }
      if (market) tracked.marketPA = market.teamA === prediction.teamA ? market.pA : 1 - market.pA
      matches.push(tracked)
    }
    const round: RoundRecord = {
      round: snapshot.beforeRound,
      savedAt: snapshot.createdAt,
      matches,
      pendingMatches,
      hits: matches.filter((m) => m.hit).length,
    }
    if (matches.length > 0)
      round.brier = matches.reduce((sum, m) => sum + m.brier, 0) / matches.length
    rounds.push(round)
  }

  const all = rounds.flatMap((r) => r.matches)
  const scored: Scored[] = all.map((m) => ({ p: m.pA, outcome: m.winner === m.teamA ? 1 : 0 }))
  const withMarket = all.filter((m) => m.marketPA !== undefined)

  const record: StageTrackRecord = {
    stageId,
    snapshotRounds: ordered.map((s) => s.beforeRound),
    rounds,
    pending,
    calibration: calibration(scored),
    upsets: all.filter((m) => m.upset).sort((a, b) => a.pWinner - b.pWinner),
  }
  if (scored.length > 0) {
    record.brier = brierScore(scored)
    record.hitRate = hitRate(scored)
  }
  if (withMarket.length > 0) {
    const outcome = (m: TrackedMatch): 0 | 1 => (m.winner === m.teamA ? 1 : 0)
    record.market = {
      matches: withMarket.length,
      model: brierScore(withMarket.map((m) => ({ p: m.pA, outcome: outcome(m) }))),
      market: brierScore(withMarket.map((m) => ({ p: m.marketPA ?? 0.5, outcome: outcome(m) }))),
    }
  }
  const first = ordered[0]
  if (advanced && first?.beforeRound === 1) {
    const teams = first.teams.map((t) => ({
      teamId: t.teamId,
      p: t.pAdvance,
      advanced: advanced.has(t.teamId),
    }))
    record.advance = {
      brier: brierScore(teams.map((t) => ({ p: t.p, outcome: t.advanced ? 1 : 0 }))),
      teams: teams.sort((a, b) => b.p - a.p),
    }
  }
  return record
}
