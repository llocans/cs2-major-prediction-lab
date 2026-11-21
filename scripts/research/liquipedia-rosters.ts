/**
 * Pulls dated rosters for an event's teams from Liquipedia team pages (MediaWiki API) into
 * data/teams/registry.json. Keeps the current squad plus anyone who left or was benched since
 * `since`, so recent predictions can point to the lineup that played.
 * Usage: node --env-file-if-exists=.env scripts/research/liquipedia-rosters.ts <event-id> [since YYYY-MM-DD]
 */
import { EventTeams, type RosterEntry, TeamRegistry } from '../../data/schemas/index.ts'
import { readJson, repoPath, writeJson } from '../lib/files.ts'
import { getPage, type WikiPage } from '../lib/liquipedia.ts'
import { findTemplates } from '../lib/wikitext.ts'

const [eventId, since = '2026-01-01'] = process.argv.slice(2)
if (!eventId) {
  console.error('Usage: node scripts/research/liquipedia-rosters.ts <event-id> [since]')
  process.exit(1)
}

const DATE = /\d{4}-\d{2}-(?:\d{2}|\?\?)/

/** First date in a Liquipedia value. "2026-07-??" (month only) becomes the 1st, flagged approximate. */
function firstDate(value: string | undefined): { date: string; approximate: boolean } | undefined {
  const found = DATE.exec(value ?? '')?.[0]
  if (!found) return undefined
  return found.endsWith('??')
    ? { date: `${found.slice(0, 8)}01`, approximate: true }
    : { date: found, approximate: false }
}

function roleOf(role: string | undefined): RosterEntry['role'] | undefined {
  const value = (role ?? '').toLowerCase()
  if (value === '' || value.includes('loan')) return 'player'
  if (value.includes('stand-in')) return 'stand-in'
  if (value.includes('coach')) return 'coach'
  return undefined // analysts, managers, etc.
}

function rosterFrom(page: WikiPage): RosterEntry[] {
  const source = {
    name: `Liquipedia: ${page.title} (rev ${page.revid})`,
    url: `https://liquipedia.net/counterstrike/${page.title.replaceAll(' ', '_')}`,
    retrievedAt: new Date().toISOString().slice(0, 10),
    license: 'CC-BY-SA 3.0',
  }
  const entries: RosterEntry[] = []
  for (const squad of findTemplates(page.text, 'Squad')) {
    const status = squad.named.status ?? 'active'
    for (const person of findTemplates(squad.raw, 'Person')) {
      const player = person.named.id
      const role = roleOf(person.named.role)
      const joined = firstDate(person.named.joindate)
      if (!player || !role || !joined) continue
      const left =
        status === 'active'
          ? undefined
          : (firstDate(person.named.inactivedate) ?? firstDate(person.named.leavedate))
      if (status !== 'active' && (!left || left.date < since)) continue
      const entry: RosterEntry = { player, role, from: joined.date, source }
      if (left) entry.to = left.date
      if (joined.approximate || left?.approximate) entry.approximate = true
      entries.push(entry)
    }
  }
  return entries
}

const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
const eventTeams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
const wanted = new Set(eventTeams.participants.map((p) => p.teamId))

for (const team of registry.teams) {
  if (!wanted.has(team.id)) continue
  const title = team.liquipediaPage ?? team.name
  let page: WikiPage
  try {
    page = await getPage(title)
  } catch (error) {
    console.error(`${team.id}: ${String(error)} (set "liquipediaPage" in registry.json)`)
    continue
  }
  const roster = rosterFrom(page)
  if (roster.length === 0) {
    console.error(`${team.id}: no squad found on "${page.title}", left unchanged`)
    continue
  }
  team.liquipediaPage = page.title
  team.roster = roster
  const current = roster
    .filter((r) => !r.to)
    .map(
      (r) =>
        `${r.player}${r.role === 'player' ? '' : ` (${r.role})`} ${r.from}${r.approximate ? '~' : ''}`,
    )
  console.log(`${team.id.padEnd(18)} ${current.join(', ')}`)
}

writeJson(repoPath('data/teams/registry.json'), TeamRegistry, registry)
