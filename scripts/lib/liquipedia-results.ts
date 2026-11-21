import type { MatchResult } from '../../data/schemas/index.ts'
import type { Pairing } from '../../engine/swiss/types.ts'
import { matchWinner, parseSwissMatches, type WikiMatch } from './wikitext.ts'

export interface ConvertOptions {
  stageId: string
  /** Liquipedia team name → our team ID. Throws for unknown teams. */
  resolveTeam: (liquipediaName: string) => string
  /** Liquipedia map name ("Dust II") → map ID ("dust2"). */
  resolveMap: (liquipediaMapName: string) => string
  source: MatchResult['source']
}

export interface StagePageData {
  results: MatchResult[]
  /** Pairings with both teams known but no result yet, by round. */
  announced: Map<number, Pairing[]>
}

/** Converts a Swiss stage page into finished results and announced pairings. Pure. */
export function readStagePage(text: string, options: ConvertOptions): StagePageData {
  const results: MatchResult[] = []
  const announced = new Map<number, Pairing[]>()
  for (const match of parseSwissMatches(text)) {
    if (!match.opponent1 || !match.opponent2) continue
    const teamA = options.resolveTeam(match.opponent1)
    const teamB = options.resolveTeam(match.opponent2)
    const winner = matchWinner(match)
    if (match.finished && winner) {
      results.push(toResult(match, teamA, teamB, winner, options))
    } else if (!winner) {
      const list = announced.get(match.round) ?? []
      list.push({ teamA, teamB })
      announced.set(match.round, list)
    }
  }
  return { results, announced }
}

function toResult(
  match: WikiMatch,
  teamA: string,
  teamB: string,
  winner: 1 | 2,
  options: ConvertOptions,
): MatchResult {
  return {
    id: `${options.stageId}-r${match.round}-${[teamA, teamB].sort().join('-')}`,
    stageId: options.stageId,
    round: match.round,
    teamA,
    teamB,
    format: match.mapSlots === 1 ? 'bo1' : match.mapSlots === 3 ? 'bo3' : 'bo5',
    maps: match.maps.map((map) => ({
      map: options.resolveMap(map.map),
      scoreA: map.score1,
      scoreB: map.score2,
    })),
    winner: winner === 1 ? teamA : teamB,
    source: options.source,
  }
}
