/** A finished (real or simulated) Swiss match. */
export interface SwissMatch {
  round: number
  teamA: string
  teamB: string
  winner: string
}

/** The stage rules the pairing logic needs. Comes from event config. */
export interface SwissRules {
  winsToAdvance: number
  lossesToEliminate: number
  /** Round 1 pairs of 1-based seeds, e.g. [[1, 9], [2, 10], ...]. */
  initialPairing: ReadonlyArray<readonly [number, number]>
}

export interface TeamRecord {
  teamId: string
  /** Initial seed in this stage, 1 = best. */
  seed: number
  wins: number
  losses: number
  opponents: string[]
}

/** A pairing for an upcoming match. teamA is the higher seed. */
export interface Pairing {
  teamA: string
  teamB: string
}
