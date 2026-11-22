import { difficultyScore } from './difficulty.ts'
import { buildRecords } from './records.ts'
import { rankTeams } from './seeding.ts'
import type { SwissMatch, SwissRules } from './types.ts'

export type SwissStatus = 'advanced' | 'eliminated' | 'active'

export interface Standing {
  teamId: string
  seed: number
  wins: number
  losses: number
  difficulty: number
  status: SwissStatus
}

/** Current standings in mid-stage seed order. Also the final seed order once the stage is done. */
export function swissStandings(
  seeds: readonly string[],
  matches: readonly SwissMatch[],
  rules: SwissRules,
): Standing[] {
  const records = buildRecords(seeds, matches)
  return rankTeams([...records.values()], records).map((record) => ({
    teamId: record.teamId,
    seed: record.seed,
    wins: record.wins,
    losses: record.losses,
    difficulty: difficultyScore(record, records),
    status:
      record.wins >= rules.winsToAdvance
        ? 'advanced'
        : record.losses >= rules.lossesToEliminate
          ? 'eliminated'
          : 'active',
  }))
}

/** The teams that advanced from a finished stage, in final mid-stage seed order (Valve). */
export function advancingTeams(
  seeds: readonly string[],
  matches: readonly SwissMatch[],
  rules: SwissRules,
): string[] {
  return swissStandings(seeds, matches, rules)
    .filter((standing) => standing.status === 'advanced')
    .map((standing) => standing.teamId)
}
