/**
 * Minimal parser for the Liquipedia wikitext we use: Swiss standings (seed order) and Match blocks.
 * Pure functions over strings; no network. Liquipedia content is CC-BY-SA 3.0.
 */

export interface Template {
  name: string
  positional: string[]
  named: Record<string, string>
  /** Raw text between the braces. */
  raw: string
}

/** All top-level-or-nested templates with this exact name, in document order. */
export function findTemplates(text: string, name: string): Template[] {
  const found: Template[] = []
  let index = text.indexOf('{{')
  while (index !== -1) {
    const end = matchingBraces(text, index)
    if (end === -1) break
    const body = text.slice(index + 2, end)
    const templateName = body.split(/[|}]/, 1)[0]?.trim() ?? ''
    if (templateName === name) found.push(parseTemplate(body))
    index = text.indexOf('{{', index + 2)
  }
  return found
}

/** Index of the "}}" that closes the "{{" at `start`, or -1. */
function matchingBraces(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++
      i++
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth--
      if (depth === 0) return i
      i++
    }
  }
  return -1
}

function parseTemplate(body: string): Template {
  const parts = splitTopLevel(body)
  const name = parts.shift()?.trim() ?? ''
  const positional: string[] = []
  const named: Record<string, string> = {}
  for (const part of parts) {
    const eq = part.indexOf('=')
    const nestedStart = part.indexOf('{{')
    if (eq !== -1 && (nestedStart === -1 || eq < nestedStart)) {
      named[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
    } else {
      positional.push(part.trim())
    }
  }
  return { name, positional, named, raw: body }
}

/** Splits on "|" that are not inside nested {{ }} or [[ ]]. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < body.length; i++) {
    const pair = body.slice(i, i + 2)
    if (pair === '{{' || pair === '[[') {
      depth++
      current += pair
      i++
    } else if ((pair === '}}' || pair === ']]') && depth > 0) {
      depth--
      current += pair
      i++
    } else if (body[i] === '|' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += body[i]
    }
  }
  parts.push(current)
  return parts
}

/** The team name inside {{TeamOpponent|name}}, lowercased. Empty string if not filled in yet. */
export function opponentName(value: string | undefined): string {
  if (!value) return ''
  const template = findTemplates(value, 'TeamOpponent')[0]
  const name = (template?.positional[0] ?? template?.named.template ?? '').trim().toLowerCase()
  // Liquipedia sometimes writes a literal TBD before a slot is decided.
  return name === 'tbd' ? '' : name
}

/**
 * Seed order of a Swiss stage (index 0 = seed 1). Liquipedia lists initial seeds as a tiebreaker
 * value where the highest value is seed 1, in either the SwissStandings or SwissTableLeague template.
 */
export function parseSwissSeeds(text: string): string[] {
  const entries: Array<{ team: string; tie: number }> = []

  for (const standings of findTemplates(text, 'SwissStandings')) {
    for (const opponent of findTemplates(standings.raw, 'TeamOpponent')) {
      const team = (opponent.positional[0] ?? '').trim().toLowerCase()
      const tie = Number(opponent.named.tiebreaker)
      if (team && Number.isFinite(tie)) entries.push({ team, tie })
    }
  }
  for (const league of findTemplates(text, 'SwissTableLeague')) {
    for (const [key, value] of Object.entries(league.named)) {
      const slot = /^team(\d+)$/.exec(key)?.[1]
      if (!slot) continue
      const tie = Number(league.named[`temp_tie${slot}`])
      if (value && Number.isFinite(tie)) entries.push({ team: value.trim().toLowerCase(), tie })
    }
  }
  if (entries.length === 0) throw new Error('No Swiss seed list found in wikitext')
  return entries.sort((a, b) => b.tie - a.tie).map((entry) => entry.team)
}

export interface WikiMap {
  map: string
  score1: number
  score2: number
}

export interface WikiMatch {
  round: number
  opponent1: string
  opponent2: string
  finished: boolean
  /** Number of map slots (1 = Bo1, 3 = Bo3, 5 = Bo5). */
  mapSlots: number
  /** Played maps only. */
  maps: WikiMap[]
  date?: string
  hltvId?: string
}

/** Every Match inside Matchlists whose matchsection is "Round N". */
export function parseSwissMatches(text: string): WikiMatch[] {
  const matches: WikiMatch[] = []
  for (const list of findTemplates(text, 'Matchlist')) {
    const round = Number(/^Round (\d+)/.exec(list.named.matchsection ?? '')?.[1])
    if (!Number.isInteger(round)) continue
    for (const match of findTemplates(list.raw, 'Match')) {
      matches.push(parseMatch(match, round))
    }
  }
  return matches
}

/** A match from a Bracket template: R<round>M<index> slots, plus the third-place match (RxMTP). */
export interface WikiBracketMatch extends WikiMatch {
  /** 0-based position within the round as drawn on the page, top to bottom (0 for third place). */
  index: number
  thirdPlace: boolean
}

/**
 * Every Match inside Bracket templates. The third-place match gets the round of the final.
 * Slots without two opponents yet (TBD) are skipped.
 */
export function parseBracketMatches(text: string): WikiBracketMatch[] {
  const matches: WikiBracketMatch[] = []
  for (const bracket of findTemplates(text, 'Bracket')) {
    const slots = Object.keys(bracket.named)
    const rounds = Math.max(0, ...slots.map((key) => Number(/^R(\d+)M\d+$/.exec(key)?.[1] ?? 0)))
    for (const key of slots) {
      const regular = /^R(\d+)M(\d+)$/.exec(key)
      const thirdPlace = key === 'RxMTP'
      if (!regular && !thirdPlace) continue
      const template = findTemplates(bracket.named[key] ?? '', 'Match')[0]
      if (!template) continue
      const match = parseMatch(template, regular ? Number(regular[1]) : rounds)
      if (!match.opponent1 || !match.opponent2) continue
      matches.push({ ...match, index: regular ? Number(regular[2]) - 1 : 0, thirdPlace })
    }
  }
  return matches.sort(
    (a, b) => a.round - b.round || Number(a.thirdPlace) - Number(b.thirdPlace) || a.index - b.index,
  )
}

function parseMatch(match: Template, round: number): WikiMatch {
  const slots = Object.keys(match.named).filter((key) => /^map\d+$/.test(key))
  const maps: WikiMap[] = []
  for (const slot of slots.sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))) {
    const map = findTemplates(match.named[slot] ?? '', 'Map')[0]
    if (!map) continue
    const parsed = parseMap(map)
    if (parsed) maps.push(parsed)
  }
  const result: WikiMatch = {
    round,
    opponent1: opponentName(match.named.opponent1),
    opponent2: opponentName(match.named.opponent2),
    finished: false,
    mapSlots: slots.length,
    maps,
  }
  // Some pages leave the match-level "finished" empty although the maps decide it.
  result.finished = match.named.finished === 'true' || matchWinner(result) !== undefined
  const date = match.named.date?.replace(/\{\{.*?\}\}/g, '').trim()
  if (date) result.date = date
  if (match.named.hltv) result.hltvId = match.named.hltv
  return result
}

/** A played map with its final score, or undefined if not played (yet). */
function parseMap(map: Template): WikiMap | undefined {
  const name = map.named.map?.trim() ?? ''
  // Only finished maps count; a map in progress has partial half scores.
  if (!name || map.named.finished !== 'true') return undefined
  let score1 = 0
  let score2 = 0
  let halves = 0
  for (const [key, value] of Object.entries(map.named)) {
    const half = /^(?:o\d+)?t([12])(?:t|ct)$/.exec(key)
    if (!half || value === '') continue
    const rounds = Number(value)
    if (!Number.isFinite(rounds)) continue
    halves++
    if (half[1] === '1') score1 += rounds
    else score2 += rounds
  }
  if (halves === 0) {
    if (map.named.score1 && map.named.score2) {
      score1 = Number(map.named.score1)
      score2 = Number(map.named.score2)
    } else {
      return undefined
    }
  }
  if (score1 === score2) return undefined
  return { map: name, score1, score2 }
}

/** Winner by maps won: 1, 2, or undefined if not decided. */
export function matchWinner(match: WikiMatch): 1 | 2 | undefined {
  const needed = Math.floor(match.mapSlots / 2) + 1
  const won1 = match.maps.filter((map) => map.score1 > map.score2).length
  const won2 = match.maps.filter((map) => map.score2 > map.score1).length
  if (won1 >= needed) return 1
  if (won2 >= needed) return 2
  return undefined
}

/**
 * Reads the output of `id={{TeamShort|key}}` lines expanded by Liquipedia: each line ends in
 * `[[Team page|SHORT]]`. Returns id → { page, short } for the lines that resolved.
 */
export function parseTeamShortLines(
  wikitext: string,
): Map<string, { page: string; short: string }> {
  const result = new Map<string, { page: string; short: string }>()
  for (const line of wikitext.split('\n')) {
    const id = /^([a-z0-9-]+)=/.exec(line)?.[1]
    const links = [...line.matchAll(/\[\[([^\]|]+)\|([^\]]+)\]\]/g)].filter(
      (m) => !/^(file|image):/i.test(m[1] ?? ''),
    )
    const last = links.at(-1)
    if (!id || !last?.[1] || !last[2]) continue
    result.set(id, { page: last[1].trim(), short: last[2].trim() })
  }
  return result
}
