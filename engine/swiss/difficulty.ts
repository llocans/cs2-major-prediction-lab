import type { TeamRecord } from './types.ts'

/**
 * Valve's Difficulty Score: the sum of current wins minus the sum of current losses of every opponent
 * the team has faced in this stage. Not chess Buchholz. Source: Major Supplemental Rulebook, "Difficulty
 * Score (Buchholz)".
 */
export function difficultyScore(record: TeamRecord, records: Map<string, TeamRecord>): number {
  let score = 0
  for (const opponentId of record.opponents) {
    const opponent = records.get(opponentId)
    if (!opponent) throw new Error(`Unknown opponent ${opponentId} of ${record.teamId}`)
    score += opponent.wins - opponent.losses
  }
  return score
}
