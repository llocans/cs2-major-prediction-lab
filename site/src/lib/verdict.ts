/**
 * Whether the model's pre-match pick came true. Under COIN_FLIP the favourite's edge is too small
 * to call it a hit or a miss.
 */
export const COIN_FLIP = 0.55

export type Verdict = 'hit' | 'miss' | 'coin-flip'

export interface Pick {
  /** The team the model favoured before the match (higher chance). */
  team: string
  /** Its chance before the match, 0.5-1. */
  p: number
  verdict: Verdict
}

/** The model's pick for a finished match, from its saved chance that `teamA` wins. */
export function pickFor(teamA: string, teamB: string, pA: number, winner: string): Pick {
  const team = pA >= 0.5 ? teamA : teamB
  const p = Math.max(pA, 1 - pA)
  const verdict: Verdict = p < COIN_FLIP ? 'coin-flip' : winner === team ? 'hit' : 'miss'
  return { team, p, verdict }
}
