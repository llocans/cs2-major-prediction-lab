/**
 * OddsPapi (free plan) for closing-line market odds, a benchmark only. Budget: the free plan has a
 * small monthly request allowance, so the poller asks at most every two hours, and only when a logged
 * result still has no benchmark. Per ask: one /v4/fixtures call (counts against the allowance) plus
 * /v4/historical-odds per new match (free of quota; on the free plan only for settled matches).
 * Key: ODDSPAPI_KEY (.env locally, a repository secret in GitHub Actions). Docs: https://oddspapi.io/docs
 */
import { z } from 'zod'
import {
  Benchmarks,
  EventConfig,
  EventResults,
  EventTeams,
  TeamRegistry,
} from '../../data/schemas/index.ts'
import { readJson, repoPath, writeJson } from './files.ts'
import {
  benchmarkEntry,
  type MarketOddsConfig,
  matchFixtures,
  OddsPapiFixture,
  OddsPapiHistorical,
  resultsWithoutBenchmark,
  type TeamNames,
} from './market-odds.ts'

const BASE = 'https://api.oddspapi.io/v4'
/** Minimum gap between calls to one endpoint, per the docs (ms), with a little slack. */
const SPACING: Record<string, number> = { 'historical-odds': 5_500, fixtures: 2_500 }
const lastCall = new Map<string, number>()

export function oddsPapiKey(): string | undefined {
  return process.env.ODDSPAPI_KEY?.trim() || undefined
}

/** One GET; the key goes in the `apiKey` query parameter (the API rejects it in headers). */
export async function oddsPapiGet(
  endpoint: string,
  params: Record<string, string>,
): Promise<unknown> {
  const key = oddsPapiKey()
  if (!key) throw new Error('ODDSPAPI_KEY is not set (see .env.example)')
  const wait = (lastCall.get(endpoint) ?? 0) + (SPACING[endpoint] ?? 1_100) - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastCall.set(endpoint, Date.now())
  const query = new URLSearchParams({ ...params, apiKey: key })
  const response = await fetch(`${BASE}/${endpoint}?${query}`, {
    // Requests without a User-Agent can be blocked by Cloudflare (OddsPapi FAQ).
    headers: {
      'User-Agent': 'cs2-major-prediction-lab (github.com/llocans/cs2-major-prediction-lab)',
    },
  })
  const body = await response.text()
  if (!response.ok) {
    // Never echo the URL: it holds the key.
    throw new Error(`OddsPapi ${endpoint}: HTTP ${response.status} ${body.slice(0, 200)}`)
  }
  return JSON.parse(body)
}

/** True on the poller's first check of every even UTC hour (at most 12 asks a day). */
export function isOddsWindow(now: Date): boolean {
  return now.getUTCHours() % 2 === 0 && now.getUTCMinutes() < 15
}

export interface OddsOutcome {
  added: number
  notes: string[]
}

/** Adds closing-line benchmarks for recently logged results that have none. Writes benchmarks.json. */
export async function collectClosingOdds(eventId: string, today: string): Promise<OddsOutcome> {
  const dir = repoPath('data/events', eventId)
  const config = readJson(`${dir}/config.json`, EventConfig)
  const market: MarketOddsConfig | undefined = config.marketOdds
  if (!market) return { added: 0, notes: [] }
  if (!oddsPapiKey()) return { added: 0, notes: ['market odds: ODDSPAPI_KEY not set'] }

  const benchmarks = readJson(`${dir}/benchmarks.json`, Benchmarks)
  const results = readJson(`${dir}/results.json`, EventResults).matches
  // Only results logged in the last two days: older ones had their chance (and cost quota).
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const missing = resultsWithoutBenchmark(results, benchmarks.entries).filter(
    (r) => r.source.retrievedAt >= since,
  )
  if (missing.length === 0) return { added: 0, notes: [] }

  const fixtures = z
    .array(OddsPapiFixture)
    .parse(
      await oddsPapiGet('fixtures', { tournamentId: String(market.tournamentId), statusId: '2' }),
    )
  const { matched, unmatched } = matchFixtures(missing, fixtures, eventTeamNames(eventId))
  const notes = unmatched.map((u) => `market odds: ${u}`)
  const added: Benchmarks['entries'] = []
  for (const match of matched) {
    const historical = OddsPapiHistorical.parse(
      await oddsPapiGet('historical-odds', {
        fixtureId: match.fixture.fixtureId,
        bookmakers: market.bookmakers.join(','),
      }),
    )
    const entry = benchmarkEntry(match, historical, market)
    if (entry) added.push(entry)
    else
      notes.push(`market odds: no closing line for ${match.result.teamA} v ${match.result.teamB}`)
  }
  if (added.length > 0) {
    writeJson(`${dir}/benchmarks.json`, Benchmarks, {
      ...benchmarks,
      entries: [...benchmarks.entries, ...added],
    })
  }
  return { added: added.length, notes }
}

/** Every name we know for each team in the event: registry name, aliases, VRS and event names. */
function eventTeamNames(eventId: string): TeamNames[] {
  const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
  const teams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
  return teams.participants.map((p) => {
    const team = registry.teams.find((t) => t.id === p.teamId)
    const names = [
      p.teamId,
      p.displayName,
      team?.name,
      team?.vrsName,
      team?.liquipediaPage,
      ...(team?.aliases ?? []).map((a) => a.name),
    ].filter((n): n is string => typeof n === 'string' && n.length > 0)
    return { id: p.teamId, names }
  })
}
