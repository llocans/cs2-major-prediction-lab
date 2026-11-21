import { buildRecords, hasPlayed, isActive } from './records.ts'
import { rankTeams } from './seeding.ts'
import type { Pairing, SwissMatch, SwissRules, TeamRecord } from './types.ts'

/**
 * Valve's priority table for groups of 6 teams (rounds 4+). Pick the top-most row without a rematch.
 * Source: Major Supplemental Rulebook, "Swiss Bracket". Copied in docs/rules.md.
 */
export const SIX_TEAM_PRIORITY: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [1, 6],
    [2, 5],
    [3, 4],
  ],
  [
    [1, 6],
    [2, 4],
    [3, 5],
  ],
  [
    [1, 5],
    [2, 6],
    [3, 4],
  ],
  [
    [1, 5],
    [2, 4],
    [3, 6],
  ],
  [
    [1, 4],
    [2, 6],
    [3, 5],
  ],
  [
    [1, 4],
    [2, 5],
    [3, 6],
  ],
  [
    [1, 6],
    [2, 3],
    [4, 5],
  ],
  [
    [1, 5],
    [2, 3],
    [4, 6],
  ],
  [
    [1, 3],
    [2, 6],
    [4, 5],
  ],
  [
    [1, 3],
    [2, 5],
    [4, 6],
  ],
  [
    [1, 4],
    [2, 3],
    [5, 6],
  ],
  [
    [1, 3],
    [2, 4],
    [5, 6],
  ],
  [
    [1, 2],
    [3, 6],
    [4, 5],
  ],
  [
    [1, 2],
    [3, 5],
    [4, 6],
  ],
  [
    [1, 2],
    [3, 4],
    [5, 6],
  ],
]

type Rematch = (a: string, b: string) => boolean

/**
 * Pairings for `round`, using only matches from earlier rounds.
 * `seeds[0]` is seed 1. Groups are returned best record first; within a group, best seed first.
 */
export function pairRound(
  round: number,
  seeds: readonly string[],
  matches: readonly SwissMatch[],
  rules: SwissRules,
): Pairing[] {
  if (round === 1) return initialPairings(seeds, rules)

  const earlier = matches.filter((match) => match.round < round)
  const records = buildRecords(seeds, earlier)
  const isRematch: Rematch = (a, b) => hasPlayed(records, a, b)

  const pairings: Pairing[] = []
  for (const group of recordGroups(records, rules)) {
    const ranked = rankTeams(group, records).map((team) => team.teamId)
    if (ranked.length % 2 !== 0) {
      throw new Error(`Round ${round}: odd group size ${ranked.length} (${ranked.join(', ')})`)
    }
    const pairs =
      round >= 4 && ranked.length === 6
        ? pairFromTable(ranked, isRematch)
        : pairHighestVsLowest(ranked, isRematch)
    for (const [teamA, teamB] of pairs) pairings.push({ teamA, teamB })
  }
  return pairings
}

function initialPairings(seeds: readonly string[], rules: SwissRules): Pairing[] {
  return rules.initialPairing.map(([seedA, seedB]) => {
    const teamA = seeds[seedA - 1]
    const teamB = seeds[seedB - 1]
    if (!teamA || !teamB) throw new Error(`Initial pairing ${seedA}v${seedB} has no team`)
    return { teamA, teamB }
  })
}

/** Active teams grouped by identical W-L record, best record first. */
function recordGroups(records: Map<string, TeamRecord>, rules: SwissRules): TeamRecord[][] {
  const groups = new Map<string, TeamRecord[]>()
  for (const record of records.values()) {
    if (!isActive(record, rules)) continue
    const key = `${record.wins}-${record.losses}`
    const group = groups.get(key)
    if (group) group.push(record)
    else groups.set(key, [record])
  }
  return [...groups.values()].sort((x, y) => {
    const a = x[0]
    const b = y[0]
    if (!a || !b) return 0
    return b.wins - b.losses - (a.wins - a.losses) || b.wins - a.wins
  })
}

/**
 * Rounds 2-3: the highest seed faces the lowest seed available that does not cause a rematch.
 * Backtracks if a greedy choice would leave the rest unpairable; allows a rematch only if no
 * rematch-free pairing exists at all.
 */
function pairHighestVsLowest(
  ranked: readonly string[],
  isRematch: Rematch,
): Array<[string, string]> {
  return search(ranked, isRematch) ?? search(ranked, () => false) ?? []
}

function search(
  ranked: readonly string[],
  isRematch: Rematch,
): Array<[string, string]> | undefined {
  const [top, ...rest] = ranked
  if (top === undefined) return []
  for (let index = rest.length - 1; index >= 0; index--) {
    const opponent = rest[index]
    if (opponent === undefined || isRematch(top, opponent)) continue
    const remaining = [...rest.slice(0, index), ...rest.slice(index + 1)]
    const tail = search(remaining, isRematch)
    if (tail) return [[top, opponent], ...tail]
  }
  return undefined
}

/**
 * Rounds 4+ with 6 teams: the top-most table row without a rematch. If every row has one, the
 * top-most row with the fewest rematches.
 */
function pairFromTable(ranked: readonly string[], isRematch: Rematch): Array<[string, string]> {
  let best: { pairs: Array<[string, string]>; rematches: number } | undefined
  for (const row of SIX_TEAM_PRIORITY) {
    const pairs = row.map(([x, y]): [string, string] => {
      const a = ranked[x - 1]
      const b = ranked[y - 1]
      if (a === undefined || b === undefined) throw new Error('Six-team table needs 6 teams')
      return [a, b]
    })
    const rematches = pairs.filter(([a, b]) => isRematch(a, b)).length
    if (rematches === 0) return pairs
    if (!best || rematches < best.rematches) best = { pairs, rematches }
  }
  if (!best) throw new Error('Six-team priority table is empty')
  return best.pairs
}
