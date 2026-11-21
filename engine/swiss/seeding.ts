import { difficultyScore } from './difficulty.ts'
import type { TeamRecord } from './types.ts'

/**
 * Mid-stage seed order (Valve): 1. current W-L record, 2. Difficulty Score, 3. initial seed.
 * Returns a new array, best seed first.
 */
export function rankTeams(
  teams: readonly TeamRecord[],
  records: Map<string, TeamRecord>,
): TeamRecord[] {
  const difficulty = new Map(teams.map((team) => [team.teamId, difficultyScore(team, records)]))
  return [...teams].sort(
    (x, y) =>
      y.wins - y.losses - (x.wins - x.losses) ||
      y.wins - x.wins ||
      (difficulty.get(y.teamId) ?? 0) - (difficulty.get(x.teamId) ?? 0) ||
      x.seed - y.seed,
  )
}
