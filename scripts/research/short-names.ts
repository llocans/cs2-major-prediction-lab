/**
 * Fills `shortName` in data/teams/registry.json for an event's teams from Liquipedia's TeamShort
 * team template (one action=expandtemplates request for all teams). Teams that play under another
 * name at the event get `shortName` in the event's teams.json instead (set by hand, sourced there).
 * Usage: node --env-file-if-exists=.env scripts/research/short-names.ts <event-id>
 */
import { EventTeams, TeamRegistry } from '../../data/schemas/index.ts'
import { readJson, repoPath, writeJson } from '../lib/files.ts'
import { expandTemplates } from '../lib/liquipedia.ts'
import { parseTeamShortLines } from '../lib/wikitext.ts'

const [eventId] = process.argv.slice(2)
if (!eventId) {
  console.error('Usage: node scripts/research/short-names.ts <event-id>')
  process.exit(1)
}

const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
const eventTeams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
const wanted = new Set(eventTeams.participants.map((p) => p.teamId))
const teams = registry.teams.filter((t) => wanted.has(t.id) && t.liquipedia)

for (const id of wanted) {
  if (!teams.some((t) => t.id === id))
    console.error(`${id}: no "liquipedia" key in registry, skipped`)
}

const text = teams.map((t) => `${t.id}={{TeamShort|${t.liquipedia}}}`).join('\n')
const found = parseTeamShortLines(await expandTemplates(text))
const today = new Date().toISOString().slice(0, 10)

for (const team of teams) {
  const entry = found.get(team.id)
  if (!entry) {
    console.error(`${team.id}: TeamShort|${team.liquipedia} did not resolve, left unchanged`)
    continue
  }
  team.shortName = {
    name: entry.short,
    source: {
      name: `Liquipedia team template TeamShort|${team.liquipedia}`,
      url: `https://liquipedia.net/counterstrike/${entry.page.replaceAll(' ', '_')}`,
      retrievedAt: today,
      license: 'CC-BY-SA 3.0',
    },
  }
  const override = eventTeams.participants.find((p) => p.teamId === team.id)?.shortName
  console.log(
    `${team.id.padEnd(18)} ${entry.short}${override ? `  (at ${eventId}: ${override})` : ''}`,
  )
}

writeJson(repoPath('data/teams/registry.json'), TeamRegistry, registry)
