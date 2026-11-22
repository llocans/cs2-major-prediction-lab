import type { MatchResult } from '../../data/schemas/index.ts'
import type { Pairing } from '../../engine/swiss/types.ts'
import { matchWinner, parseBracketMatches, parseSwissMatches, type WikiMatch } from './wikitext.ts'

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

/**
 * Finished results of a single-elimination stage page (Bracket template), plus a note for each match
 * marked finished whose maps decide no winner (skipped). Rounds and formats here come from the page;
 * logResults replaces them with the bracket slot's round and format from config. Pure.
 */
export function readBracketPage(
  text: string,
  options: ConvertOptions,
): { results: MatchResult[]; skipped: string[] } {
  const results: MatchResult[] = []
  const skipped: string[] = []
  for (const match of parseBracketMatches(text)) {
    const winner = matchWinner(match)
    if (match.finished && !winner) {
      skipped.push(
        `${match.opponent1} v ${match.opponent2}: marked finished but its maps decide no winner`,
      )
    }
    if (!match.finished || !winner) continue
    const teamA = options.resolveTeam(match.opponent1)
    const teamB = options.resolveTeam(match.opponent2)
    const result = toResult(match, teamA, teamB, winner, options)
    results.push(match.thirdPlace ? { ...result, id: `${result.id}-third` } : result)
  }
  return { results, skipped }
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
