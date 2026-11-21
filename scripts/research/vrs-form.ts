/**
 * Derives each event team's recent form from Valve's VRS match tables (no Claude usage, no scraping).
 * Writes data/teams/form/<team-id>.json.
 * Usage: node scripts/research/vrs-form.ts <event-id> <standings-date YYYY_MM_DD>
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { EventTeams, TeamForm, TeamRegistry } from '../../data/schemas/index.ts'
import { readJson, repoPath, writeJson } from '../lib/files.ts'

const [eventId, standingsDate] = process.argv.slice(2)
if (!eventId || !standingsDate || !/^\d{4}_\d{2}_\d{2}$/.test(standingsDate)) {
  console.error('Usage: node scripts/research/vrs-form.ts <event-id> <YYYY_MM_DD>')
  process.exit(1)
}

const REPO = 'ValveSoftware/counter-strike_regional_standings'
const year = standingsDate.slice(0, 4)
const asOf = standingsDate.replaceAll('_', '-')

function cached(path: string): string {
  const file = repoPath('.cache/vrs', path.replaceAll('/', '__'))
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const content = execFileSync(
    'gh',
    ['api', `repos/${REPO}/contents/${path}`, '--jq', '.content'],
    {
      encoding: 'utf8',
    },
  )
  const text = Buffer.from(content, 'base64').toString('utf8')
  mkdirSync(repoPath('.cache/vrs'), { recursive: true })
  writeFileSync(file, text)
  return text
}

interface StandingRow {
  rank: number
  points: number
  name: string
  details: string
}

function parseStandings(text: string): StandingRow[] {
  const rows: StandingRow[] = []
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    const rank = Number(cells[1])
    const link = /\]\((details\/[^)]+)\)/.exec(line)?.[1]
    if (!Number.isInteger(rank) || !link) continue
    rows.push({ rank, points: Number(cells[2]), name: cells[3] ?? '', details: link })
  }
  return rows
}

interface SeriesRow {
  date: string
  opponent: string
  result: 'W' | 'L'
  roster: string[]
}

function parseDetails(text: string): SeriesRow[] {
  const table = text.split('<span id="table2">')[0] ?? ''
  const rows: SeriesRow[] = []
  for (const line of table.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    const date = cells[3] ?? ''
    const result = cells[5]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (result !== 'W' && result !== 'L')) continue
    rows.push({
      date,
      opponent: cells[4] ?? '',
      result,
      roster: (cells[12] ?? '')
        .split(',')
        .map((player) => player.trim())
        .filter(Boolean),
    })
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

const standingsPath = `live/${year}/standings_global_${standingsDate}.md`
const standings = parseStandings(cached(standingsPath))
// The first (highest) entry wins when an organization has several rosters listed.
const byName = new Map<string, StandingRow>()
for (const row of standings) if (!byName.has(row.name)) byName.set(row.name, row)
const rankOf = (name: string) => byName.get(name)?.rank

const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
const eventTeams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
const cutoff90 = new Date(Date.parse(asOf) - 90 * 86_400_000).toISOString().slice(0, 10)

for (const participant of eventTeams.participants) {
  const team = registry.teams.find((t) => t.id === participant.teamId)
  const vrsName = team?.vrsName
  const row = vrsName ? byName.get(vrsName) : undefined
  if (!row) {
    console.error(`${participant.teamId}: not found in VRS standings as "${vrsName}", skipped`)
    continue
  }
  const series = parseDetails(cached(`live/${year}/${row.details}`))
  const count = (rows: SeriesRow[]) => ({
    won: rows.filter((r) => r.result === 'W').length,
    lost: rows.filter((r) => r.result === 'L').length,
  })
  const form: TeamForm = {
    schemaVersion: 1,
    teamId: participant.teamId,
    asOf,
    vrs: { rank: row.rank, points: row.points },
    roster: series[0]?.roster ?? [],
    summary: {
      last90Days: count(series.filter((r) => r.date >= cutoff90)),
      vsTop30: count(series.filter((r) => (rankOf(r.opponent) ?? 999) <= 30)),
      tier1Series: series.filter((r) => (rankOf(r.opponent) ?? 999) <= 50).length,
    },
    recent: series.slice(0, 20).map((r) => {
      const opponentRank = rankOf(r.opponent)
      return opponentRank === undefined
        ? { date: r.date, opponent: r.opponent, result: r.result }
        : { date: r.date, opponent: r.opponent, opponentRank, result: r.result }
    }),
    source: {
      name: `Valve VRS ${asOf}: ${row.details}`,
      url: `https://github.com/${REPO}/blob/main/live/${year}/${row.details}`,
      retrievedAt: new Date().toISOString().slice(0, 10),
    },
  }
  writeJson(repoPath('data/teams/form', `${participant.teamId}.json`), TeamForm, form)
  const s = form.summary
  console.log(
    `${participant.teamId.padEnd(18)} #${row.rank} ${row.points}  90d ${s.last90Days.won}-${s.last90Days.lost}  top30 ${s.vsTop30.won}-${s.vsTop30.lost}  tier1 ${s.tier1Series}`,
  )
}
