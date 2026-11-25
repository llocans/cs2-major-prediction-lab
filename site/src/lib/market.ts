/**
 * Market odds next to the model's, for display only (a benchmark, never a model input).
 *
 * Two kinds, both read by hand: pre-match odds read before a round (`bookmaker-odds.json`, when
 * someone had time) and the closing line averaged over about 10 bookmakers (`benchmarks.json`,
 * filled after the round). The site shows one price per match: the pre-match odds if logged,
 * otherwise the closing line, and labels which kind it is.
 */
interface Pair {
  teamA: string
  teamB: string
}

interface OddsLike extends Pair {
  stageId: string
  round?: number
  pA: number
  source?: { name: string }
}

/** The parts of an event's data this needs (EventData fits). */
export interface MarketData {
  benchmarks: ReadonlyArray<OddsLike>
  bookmakerOdds?: ReadonlyArray<OddsLike>
  snapshots: ReadonlyArray<{
    stageId: string
    beforeRound: number
    matches: ReadonlyArray<Pair & { pA: number }>
  }>
  results: { matches: ReadonlyArray<Pair & { stageId: string; round: number; winner: string }> }
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const matchKey = (o: OddsLike) => `${o.stageId}|${o.round}|${pairKey(o.teamA, o.teamB)}`

/**
 * One price per match: every entry of `preferred` (odds read before the round), plus the
 * `fallback` entries (closing lines) for matches `preferred` does not have.
 */
export function displayOdds<T extends OddsLike>(
  preferred: readonly T[],
  fallback: readonly T[],
): T[] {
  const have = new Set(preferred.map(matchKey))
  return [...preferred, ...fallback.filter((o) => o.round !== undefined && !have.has(matchKey(o)))]
}

/** Which kind of market price a source is, for labels: "closing avg" or "pre-match". */
export function sourceLabel(name: string | undefined): string | undefined {
  if (!name) return undefined
  return name.startsWith('OddsPortal') ? 'closing avg' : 'pre-match'
}

/** The market's chance that `team` beats `opponent` in this round and where it comes from. */
export function marketQuote(
  event: MarketData,
  stageId: string,
  round: number,
  team: string,
  opponent: string,
): { p: number; source?: string } | undefined {
  const entry = displayOdds(event.bookmakerOdds ?? [], event.benchmarks).find(
    (b) =>
      b.stageId === stageId &&
      b.round === round &&
      pairKey(b.teamA, b.teamB) === pairKey(team, opponent),
  )
  if (!entry) return undefined
  const label = sourceLabel(entry.source?.name)
  return { p: entry.teamA === team ? entry.pA : 1 - entry.pA, ...(label ? { source: label } : {}) }
}

/** The market's chance that `team` beats `opponent` in this stage round, if one was logged. */
export function marketChance(
  event: MarketData,
  stageId: string,
  round: number,
  team: string,
  opponent: string,
): number | undefined {
  return marketQuote(event, stageId, round, team, opponent)?.p
}

export interface TeamMatchRow {
  round: number
  opponent: string
  /** The model's chance before the round (from that round's snapshot). */
  model?: number
  market?: number
  /** Which kind of market price it is ("pre-match", "closing avg"). */
  marketSource?: string
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
  for (const r of rows.values()) {
    const quote = marketQuote(event, stageId, r.round, team, r.opponent)
    r.market = quote?.p
    if (quote?.source) r.marketSource = quote.source
  }
  return [...rows.values()].sort((a, b) => a.round - b.round)
}
