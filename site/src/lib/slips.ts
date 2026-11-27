import type { Slip, SlipLeg } from '../../../data/schemas/slips.ts'
import { type SlipOutcome, slipOutcome, winnersByPair } from '../../../engine/bet-slips.ts'
import type { EventData } from './data.ts'

export interface SlipView extends Slip {
  outcome: SlipOutcome
  /** Winner per leg once played, in leg order. */
  winners: Array<string | undefined>
}

export interface RoundSlips {
  slips: SlipView[]
  /** Which odds the payouts use: the bookmaker's own (this Mac only) or margin-free. */
  odds: 'real' | 'margin-free'
  /** Set when the round's batches built no slip: why. */
  noSlip?: string
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * A round's frozen bet slips with their outcomes. Payouts use the bookmaker's own odds when the
 * batch was built with them and they are available (dev server only), else margin-free odds.
 * Undefined when no batch was built for the round.
 */
export function roundSlips(
  event: EventData,
  stageId: string,
  round: number,
): RoundSlips | undefined {
  const batches = event.slips.filter((b) => b.stageId === stageId && b.round === round)
  if (batches.length === 0) return undefined
  const winners = winnersByPair(event.results.matches, stageId, round)
  const useReal = batches.every((b) => b.odds === 'real') && event.realOdds.length > 0
  const oddsFor = (leg: SlipLeg): number | undefined => {
    const key = pairKey(leg.teamA, leg.teamB)
    if (useReal) {
      const real = event.realOdds.find(
        (o) => o.stageId === stageId && o.round === round && pairKey(o.teamA, o.teamB) === key,
      )
      if (real) return leg.pick === real.teamA ? real.oddsA : real.oddsB
    }
    const entry = event.bookmakerOdds.find(
      (o) => o.stageId === stageId && o.round === round && pairKey(o.teamA, o.teamB) === key,
    )
    if (!entry) return undefined
    return 1 / (leg.pick === entry.teamA ? entry.pA : 1 - entry.pA)
  }
  const slips = batches.flatMap((b) =>
    b.slips.map((slip) => ({
      ...slip,
      outcome: slipOutcome(slip, winners, oddsFor),
      winners: slip.legs.map((l) => winners.get(pairKey(l.teamA, l.teamB))),
    })),
  )
  const left = batches.flatMap((b) => b.left)
  const noSlip =
    slips.length > 0
      ? undefined
      : left.length > 0
        ? 'no value pick still has value at the bookmaker’s real odds'
        : 'no value picks'
  return { slips, odds: useReal ? 'real' : 'margin-free', ...(noSlip ? { noSlip } : {}) }
}

export interface SlipTally {
  slips: number
  won: number
  lost: number
  units: number
}

/** A stage's slip record by kind (safer, riskier, extra), over its rounds. */
export function stageSlipRecord(
  event: EventData,
  stageId: string,
  rounds: readonly number[],
): Map<Slip['kind'], SlipTally> {
  const record = new Map<Slip['kind'], SlipTally>()
  for (const round of rounds) {
    for (const slip of roundSlips(event, stageId, round)?.slips ?? []) {
      const t = record.get(slip.kind) ?? { slips: 0, won: 0, lost: 0, units: 0 }
      t.slips++
      if (slip.outcome.status === 'won') t.won++
      if (slip.outcome.status === 'lost') t.lost++
      t.units += slip.outcome.units ?? 0
      record.set(slip.kind, t)
    }
  }
  return record
}
