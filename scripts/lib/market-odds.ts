/**
 * Closing-line market odds from OddsPapi responses, turned into benchmark entries. Pure: the API
 * calls live in oddspapi.ts. Market odds are a benchmark only, never a model input.
 */
import { z } from 'zod'
import type { Benchmarks, EventConfig, MatchResult } from '../../data/schemas/index.ts'

/** One fixture from GET /v4/fixtures (only the fields we use; the API sends more). */
export const OddsPapiFixture = z.object({
  fixtureId: z.string(),
  participant1Name: z.string(),
  participant2Name: z.string(),
  startTime: z.string(),
  trueStartTime: z.string().nullable().optional(),
  statusId: z.number(),
})
export type OddsPapiFixture = z.infer<typeof OddsPapiFixture>

/**
 * The fixtures response, element by element: a bare array or one wrapped in `data`; entries that do
 * not fit (e.g. a slot whose teams are not known yet) are skipped instead of failing the list.
 */
export function parseFixtures(json: unknown): OddsPapiFixture[] {
  const wrapped = z.object({ data: z.array(z.unknown()) }).safeParse(json)
  const list = Array.isArray(json) ? json : wrapped.success ? wrapped.data.data : undefined
  if (!list) throw new Error('OddsPapi fixtures: expected a list')
  return list.flatMap((item) => {
    const parsed = OddsPapiFixture.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

/** A price change; null prices (suspended outcomes) are kept and ignored by closingPrice. */
const PriceEntry = z.object({
  createdAt: z.string(),
  price: z.number().nullable(),
  active: z.boolean().nullable().optional(),
})
/** GET /v4/historical-odds: bookmaker → market → outcome → player ("0") → price changes. */
export const OddsPapiHistorical = z.object({
  fixtureId: z.string(),
  bookmakers: z.record(
    z.string(),
    z.object({
      markets: z
        .record(
          z.string(),
          z.object({
            outcomes: z
              .record(
                z.string(),
                z.object({
                  players: z.record(z.string(), z.array(PriceEntry)).optional().default({}),
                }),
              )
              .optional()
              .default({}),
          }),
        )
        .optional()
        .default({}),
    }),
  ),
})
export type OddsPapiHistorical = z.infer<typeof OddsPapiHistorical>

export type MarketOddsConfig = NonNullable<EventConfig['marketOdds']>
type Entry = Benchmarks['entries'][number]

const SUFFIXES = /\b(e-?sports?|gaming|team|clan|club|gg)\b/g
/** "Imperial eSports" → "imperial", "9z Team" → "9z", "BC.Game" → "bcgame". */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(SUFFIXES, '')
    .replace(/[^a-z0-9]/g, '')
}

export interface TeamNames {
  id: string
  names: readonly string[]
}

/** Our team ID for a provider name: an exact normalized match among the event's teams, else none. */
export function matchTeam(name: string, teams: readonly TeamNames[]): string | undefined {
  const wanted = normalizeTeamName(name)
  if (!wanted) return undefined
  const hits = teams.filter((t) => t.names.some((n) => normalizeTeamName(n) === wanted))
  return hits.length === 1 ? hits[0]?.id : undefined
}

/**
 * The last offered price recorded before `start` (ISO), with its time. Suspended entries
 * (`active: false`) and missing prices are not offers, so they are skipped. No start, no price.
 */
export function closingPrice(
  entries: readonly { createdAt: string; price: number | null; active?: boolean | null }[],
  start: string,
): { price: number; at: string } | undefined {
  const limit = Date.parse(start)
  if (!Number.isFinite(limit)) return undefined
  let best: { price: number; at: string; t: number } | undefined
  for (const entry of entries) {
    const t = Date.parse(entry.createdAt)
    if (entry.price === null || entry.active === false) continue
    if (!Number.isFinite(t) || t >= limit || entry.price <= 1) continue
    if (!best || t > best.t) best = { price: entry.price, at: entry.createdAt, t }
  }
  return best && { price: best.price, at: best.at }
}

/** Margin-free probability that participant1 wins, averaged over bookmakers with both closing prices. */
export function closingProbability(
  historical: OddsPapiHistorical,
  config: Pick<MarketOddsConfig, 'marketId' | 'outcomes'>,
  start: string,
): { p1: number; bookmakers: string[]; observedAt: string } | undefined {
  const probabilities: number[] = []
  const bookmakers: string[] = []
  let observedAt = ''
  for (const [slug, book] of Object.entries(historical.bookmakers)) {
    const outcomes = book.markets[config.marketId]?.outcomes
    const one = closingPrice(outcomes?.[config.outcomes[0]]?.players['0'] ?? [], start)
    const two = closingPrice(outcomes?.[config.outcomes[1]]?.players['0'] ?? [], start)
    if (!one || !two) continue
    probabilities.push(1 / one.price / (1 / one.price + 1 / two.price))
    bookmakers.push(slug)
    for (const at of [one.at, two.at]) if (at > observedAt) observedAt = at
  }
  if (probabilities.length === 0) return undefined
  const p1 = probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length
  return { p1, bookmakers, observedAt }
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|')

/** Results that have no benchmark yet (matched by stage, round and pair). */
export function resultsWithoutBenchmark(
  results: readonly MatchResult[],
  entries: readonly Entry[],
): MatchResult[] {
  const have = new Set(entries.map((e) => `${e.stageId}|${e.round}|${pairKey(e.teamA, e.teamB)}`))
  return results.filter((r) => !have.has(`${r.stageId}|${r.round}|${pairKey(r.teamA, r.teamB)}`))
}

export interface FixtureMatch {
  result: MatchResult
  fixture: OddsPapiFixture
  /** True when the provider lists our teamA as participant1. */
  teamAIsParticipant1: boolean
}

const DAY = 86_400_000

/**
 * Pairs results with settled provider fixtures by teams. Two teams can meet again in a later stage,
 * so a fixture counts only if it started on the day the result was logged (`source.retrievedAt`) or
 * the day before (a match over midnight); of several, the latest. A rematch is always on a later day.
 */
export function matchFixtures(
  results: readonly MatchResult[],
  fixtures: readonly OddsPapiFixture[],
  teams: readonly TeamNames[],
): { matched: FixtureMatch[]; unmatched: string[] } {
  const matched: FixtureMatch[] = []
  const unmatched: string[] = []
  const unknown = new Set<string>()
  const byPair = new Map<string, Array<{ fixture: OddsPapiFixture; p1: string }>>()
  for (const fixture of fixtures) {
    if (fixture.statusId !== 2) continue
    const p1 = matchTeam(fixture.participant1Name, teams)
    const p2 = matchTeam(fixture.participant2Name, teams)
    if (!p1) unknown.add(fixture.participant1Name)
    if (!p2) unknown.add(fixture.participant2Name)
    if (!p1 || !p2) continue
    const key = pairKey(p1, p2)
    byPair.set(key, [...(byPair.get(key) ?? []), { fixture, p1 }])
  }
  for (const result of results) {
    const candidates = byPair.get(pairKey(result.teamA, result.teamB)) ?? []
    const loggedDay = Date.parse(`${result.source.retrievedAt}T00:00:00Z`)
    const pick = candidates
      .filter((c) => {
        const start = Date.parse(c.fixture.startTime)
        return start >= loggedDay - DAY && start < loggedDay + DAY
      })
      .sort((a, b) => Date.parse(b.fixture.startTime) - Date.parse(a.fixture.startTime))[0]
    if (!pick) {
      unmatched.push(`${result.teamA} v ${result.teamB}`)
      continue
    }
    matched.push({ result, fixture: pick.fixture, teamAIsParticipant1: pick.p1 === result.teamA })
  }
  for (const name of unknown) unmatched.push(`provider team "${name}" not matched`)
  return { matched, unmatched }
}

/** A benchmark entry from a matched fixture's historical odds, or undefined if it has no closing line. */
export function benchmarkEntry(
  match: FixtureMatch,
  historical: OddsPapiHistorical,
  config: MarketOddsConfig,
): Entry | undefined {
  const start = match.fixture.trueStartTime ?? match.fixture.startTime
  const closing = closingProbability(historical, config, start)
  if (!closing) return undefined
  const pA = match.teamAIsParticipant1 ? closing.p1 : 1 - closing.p1
  return {
    stageId: match.result.stageId,
    round: match.result.round,
    teamA: match.result.teamA,
    teamB: match.result.teamB,
    pA: Math.round(pA * 10_000) / 10_000,
    source: {
      name: `OddsPapi closing line (${closing.bookmakers.join(', ')}; margin removed, mean), fixture ${match.fixture.fixtureId}`,
      url: 'https://oddspapi.io/docs/get-historical-odds',
      retrievedAt: new Date().toISOString().slice(0, 10),
    },
    observedAt: new Date(Date.parse(closing.observedAt)).toISOString(),
  }
}
