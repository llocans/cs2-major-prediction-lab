import type { SwissMatch, SwissRules, TeamRecord } from './types.ts'

/**
 * Builds each team's record from the matches played so far.
 * `seeds[0]` is seed 1. Throws on matches with unknown teams or an invalid winner.
 */
export function buildRecords(
  seeds: readonly string[],
  matches: readonly SwissMatch[],
): Map<string, TeamRecord> {
  const records = new Map<string, TeamRecord>()
  seeds.forEach((teamId, index) => {
    records.set(teamId, { teamId, seed: index + 1, wins: 0, losses: 0, opponents: [] })
  })
  for (const match of matches) {
    const a = records.get(match.teamA)
    const b = records.get(match.teamB)
    if (!a || !b) {
      throw new Error(
        `Match in round ${match.round} has a team not in this stage: ${describe(match)}`,
      )
    }
    if (match.winner !== match.teamA && match.winner !== match.teamB) {
      throw new Error(`Winner is not one of the two teams: ${describe(match)}`)
    }
    const [winner, loser] = match.winner === match.teamA ? [a, b] : [b, a]
    winner.wins++
    loser.losses++
    a.opponents.push(b.teamId)
    b.opponents.push(a.teamId)
  }
  return records
}

export function isActive(record: TeamRecord, rules: SwissRules): boolean {
  return record.wins < rules.winsToAdvance && record.losses < rules.lossesToEliminate
}

export function hasPlayed(records: Map<string, TeamRecord>, a: string, b: string): boolean {
  return records.get(a)?.opponents.includes(b) ?? false
}

function describe(match: SwissMatch): string {
  return `${match.teamA} vs ${match.teamB} (winner ${match.winner})`
}
