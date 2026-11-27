import type { Slip, SlipLeg } from '../data/schemas/slips.ts'
import type { Confidence } from '../data/schemas/snapshot.ts'
import type { MarketMatch } from './market-picks.ts'

/**
 * Bet slips: a round's value picks combined the way the user bets them by hand (docs/roadmap.md,
 * "Bet slips from Stage 2"). The safer slip holds High/Medium picks the model expects to win, ranked
 * by the model's chance; the riskier slip holds the rest (value underdogs, Low picks); an extra slip
 * takes any overflow. A slip is only built when the model would back it: every leg must still have
 * value at the odds used (chance × odds above 1), so the product over the slip is above 1 as well.
 * Benchmark only: the model never reads market odds.
 */
export interface SlipRule {
  maxLegs: number
  safeMinChance: number
}

/** A value pick that may go into a slip, seen from the picked side. */
export interface SlipCandidate {
  teamA: string
  teamB: string
  pick: string
  confidence: Confidence
  /** The model's chance that the pick wins. */
  model: number
  /** The market's margin-free chance that the pick wins. */
  market: number
  /** Decimal odds on the pick: the bookmaker's own, or margin-free (1 / market). */
  odds: number
}

export type LeftReason = 'no-value' | 'over-limit'

export interface SlipBuild {
  slips: Slip[]
  left: Array<SlipLeg & { reason: LeftReason }>
}

/**
 * The chance a slip uses for one leg: the model's, or for a Low confidence pick a cautious chance
 * halfway between model and market (the model pulls toward 50% when it has little data).
 */
export function legChance(c: Pick<SlipCandidate, 'confidence' | 'model' | 'market'>): number {
  return c.confidence === 'low' ? (c.model + c.market) / 2 : c.model
}

const toLeg = (c: SlipCandidate): SlipLeg => ({
  teamA: c.teamA,
  teamB: c.teamB,
  pick: c.pick,
  chance: Math.round(legChance(c) * 10000) / 10000,
})

/** Splits a round's candidates into slips. Pure; the order of the input does not matter. */
export function buildSlips(candidates: readonly SlipCandidate[], rule: SlipRule): SlipBuild {
  const left: SlipBuild['left'] = []
  const valued: SlipCandidate[] = []
  for (const c of candidates) {
    // A tiny tolerance so a price exactly at the model's chance does not count as value.
    if (legChance(c) * c.odds > 1 + 1e-9) valued.push(c)
    else left.push({ ...toLeg(c), reason: 'no-value' })
  }
  const byChance = (a: SlipCandidate, b: SlipCandidate) =>
    legChance(b) - legChance(a) || a.pick.localeCompare(b.pick)
  const isSafe = (c: SlipCandidate) =>
    c.confidence !== 'low' && c.model >= rule.safeMinChance - 1e-9
  const safe = valued.filter(isSafe).sort(byChance)
  const safer = safe.slice(0, rule.maxLegs)
  // Safe picks beyond the safer slip's limit join the riskier pool.
  const rest = [...safe.slice(rule.maxLegs), ...valued.filter((c) => !isSafe(c))].sort(byChance)
  const riskier = rest.slice(0, rule.maxLegs)
  const extra = rest.slice(rule.maxLegs, rule.maxLegs * 2)
  for (const c of rest.slice(rule.maxLegs * 2)) left.push({ ...toLeg(c), reason: 'over-limit' })

  const slips: Slip[] = []
  if (safer.length > 0) slips.push({ kind: 'safer', legs: safer.map(toLeg) })
  if (riskier.length > 0) slips.push({ kind: 'riskier', legs: riskier.map(toLeg) })
  if (extra.length > 0) slips.push({ kind: 'extra', legs: extra.map(toLeg) })
  return { slips, left }
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export interface PoolOdds {
  teamA: string
  teamB: string
  /** Decimal odds on teamA and teamB. */
  oddsA: number
  oddsB: number
  observedAt?: string
  startsAt?: string
}

/**
 * The pool for one batch (one odds reading): the round's value picks whose odds were read before
 * their match starts, whose match has not started or been played at `now`, and that are not already
 * in an earlier batch's slip. A match without a known kickoff counts as not started until it has a
 * result.
 */
export function slipPool(
  matches: readonly MarketMatch[],
  odds: readonly PoolOdds[],
  alreadySlipped: readonly SlipLeg[],
  now: string,
): SlipCandidate[] {
  const slipped = new Set(alreadySlipped.map((l) => pairKey(l.teamA, l.teamB)))
  const pool: SlipCandidate[] = []
  for (const m of matches) {
    if (!m.pick || m.result || m.marketA === undefined) continue
    const key = pairKey(m.teamA, m.teamB)
    if (slipped.has(key)) continue
    const entry = odds.find((o) => pairKey(o.teamA, o.teamB) === key)
    if (!entry?.observedAt) continue
    if (entry.startsAt && (entry.observedAt >= entry.startsAt || now >= entry.startsAt)) continue
    const pickIsA = m.pick === m.teamA
    const pickIsEntryA = m.pick === entry.teamA
    pool.push({
      teamA: m.teamA,
      teamB: m.teamB,
      pick: m.pick,
      confidence: m.confidence,
      model: pickIsA ? m.modelA : 1 - m.modelA,
      market: pickIsA ? m.marketA : 1 - m.marketA,
      odds: pickIsEntryA ? entry.oddsA : entry.oddsB,
    })
  }
  return pool
}

export interface SlipOutcome {
  /** The chance that every leg wins, from the legs' stored chances. */
  chanceAll: number
  /** Combined decimal odds, when every leg's odds are known. */
  odds?: number
  status: 'won' | 'lost' | 'pending'
  /** Profit from 1 unit: odds − 1 when won, −1 when lost. Set once decided and odds are known. */
  units?: number
}

/**
 * A slip's outcome from the real results: lost as soon as one leg loses, won when all legs win.
 * `oddsFor` gives the decimal odds on a leg's pick (real or margin-free), if known.
 */
export function slipOutcome(
  slip: Slip,
  winners: ReadonlyMap<string, string>,
  oddsFor: (leg: SlipLeg) => number | undefined,
): SlipOutcome {
  const chanceAll = slip.legs.reduce((p, l) => p * l.chance, 1)
  const legOdds = slip.legs.map(oddsFor)
  const odds = legOdds.every((o): o is number => o !== undefined)
    ? legOdds.reduce((p, o) => p * o, 1)
    : undefined
  const results = slip.legs.map((l) => winners.get(pairKey(l.teamA, l.teamB)))
  const lost = slip.legs.some((l, i) => results[i] !== undefined && results[i] !== l.pick)
  const won = !lost && results.every((r) => r !== undefined)
  const status = lost ? 'lost' : won ? 'won' : 'pending'
  const units =
    status === 'lost' ? -1 : status === 'won' && odds !== undefined ? odds - 1 : undefined
  return {
    chanceAll,
    ...(odds !== undefined ? { odds } : {}),
    status,
    ...(units !== undefined ? { units } : {}),
  }
}

/** Winners of one round's played matches, keyed by pair, for `slipOutcome`. */
export function winnersByPair(
  results: ReadonlyArray<{
    stageId: string
    round: number
    teamA: string
    teamB: string
    winner: string
  }>,
  stageId: string,
  round: number,
): Map<string, string> {
  return new Map(
    results
      .filter((r) => r.stageId === stageId && r.round === round)
      .map((r) => [pairKey(r.teamA, r.teamB), r.winner]),
  )
}
