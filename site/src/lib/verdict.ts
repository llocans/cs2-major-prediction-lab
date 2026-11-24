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

/**
 * Verdict for one team's pre-match chance `p` once the match is played, or undefined when the
 * model did not pick this team (p < 0.5).
 */
export function chanceVerdict(p: number, won: boolean): Verdict | undefined {
  if (p < 0.5) return undefined
  if (p < COIN_FLIP) return 'coin-flip'
  return won ? 'hit' : 'miss'
}

/** The model's pick for a finished match, from its saved chance that `teamA` wins. */
export function pickFor(teamA: string, teamB: string, pA: number, winner: string): Pick {
  const team = pA >= 0.5 ? teamA : teamB
  const p = Math.max(pA, 1 - pA)
  return { team, p, verdict: chanceVerdict(p, winner === team) ?? 'coin-flip' }
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

interface Pair {
  teamA: string
  teamB: string
}

/**
 * The model's saved pick for each finished match of a stage, keyed "round|a|b" (as the bracket
 * reads it), from the snapshot saved before that round.
 */
export function stagePicks(
  snapshots: ReadonlyArray<{
    stageId: string
    beforeRound: number
    matches: ReadonlyArray<Pair & { pA: number }>
  }>,
  results: ReadonlyArray<Pair & { stageId: string; round: number; winner: string }>,
  stageId: string,
): Map<string, Pick> {
  const picks = new Map<string, Pick>()
  for (const m of results) {
    if (m.stageId !== stageId) continue
    const snapshot = snapshots.find((s) => s.stageId === stageId && s.beforeRound === m.round)
    const saved = snapshot?.matches.find(
      (s) => pairKey(s.teamA, s.teamB) === pairKey(m.teamA, m.teamB),
    )
    if (saved) {
      picks.set(
        `${m.round}|${pairKey(m.teamA, m.teamB)}`,
        pickFor(saved.teamA, saved.teamB, saved.pA, m.winner),
      )
    }
  }
  return picks
}
