/**
 * Market odds next to the model's, for display only (a benchmark, never a model input). Round 1 has
 * odds from before the matches; later rounds get closing lines once a match is settled.
 */
interface Pair {
  teamA: string
  teamB: string
}

/** The parts of an event's data this needs (EventData fits). */
export interface MarketData {
  benchmarks: ReadonlyArray<Pair & { stageId: string; round?: number; pA: number }>
  snapshots: ReadonlyArray<{
    stageId: string
    beforeRound: number
    matches: ReadonlyArray<Pair & { pA: number }>
  }>
  results: { matches: ReadonlyArray<Pair & { stageId: string; round: number; winner: string }> }
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** The market's chance that `team` beats `opponent` in this stage round, if one was logged. */
export function marketChance(
  event: MarketData,
  stageId: string,
  round: number,
  team: string,
  opponent: string,
): number | undefined {
  const entry = event.benchmarks.find(
    (b) =>
      b.stageId === stageId &&
      b.round === round &&
      pairKey(b.teamA, b.teamB) === pairKey(team, opponent),
  )
  if (!entry) return undefined
  return entry.teamA === team ? entry.pA : 1 - entry.pA
}

export interface TeamMatchRow {
  round: number
  opponent: string
  /** The model's chance before the round (from that round's snapshot). */
  model?: number
  market?: number
  result?: 'W' | 'L'
}

/** A team's matches in a stage so far: the model's saved chance, the market's, and the result. */
export function teamStageMatches(event: MarketData, stageId: string, team: string): TeamMatchRow[] {
  const rows = new Map<number, TeamMatchRow>()
  const row = (round: number, opponent: string) => {
    const existing = rows.get(round)
    if (existing) return existing
    const created: TeamMatchRow = { round, opponent }
    rows.set(round, created)
    return created
  }
  for (const snapshot of event.snapshots) {
    if (snapshot.stageId !== stageId) continue
    const match = snapshot.matches.find((m) => m.teamA === team || m.teamB === team)
    if (!match) continue
    const isA = match.teamA === team
    const r = row(snapshot.beforeRound, isA ? match.teamB : match.teamA)
    if (pairKey(r.opponent, team) === pairKey(match.teamA, match.teamB)) {
      r.model = isA ? match.pA : 1 - match.pA
    }
  }
  for (const match of event.results.matches) {
    if (match.stageId !== stageId || (match.teamA !== team && match.teamB !== team)) continue
    const opponent = match.teamA === team ? match.teamB : match.teamA
    const r = row(match.round, opponent)
    // The real pairing wins over a snapshot that predicted another opponent.
    if (r.opponent !== opponent) {
      r.opponent = opponent
      r.model = undefined
    }
    r.result = match.winner === team ? 'W' : 'L'
  }
  for (const r of rows.values()) r.market = marketChance(event, stageId, r.round, team, r.opponent)
  return [...rows.values()].sort((a, b) => a.round - b.round)
}
