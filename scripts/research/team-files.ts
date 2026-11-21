/**
 * Creates the lean research file data/teams/<team-id>.md for each event team that has none yet.
 * Facts come from data/teams/form/<id>.json (Valve VRS) and event files; sections that need
 * interactive research are marked "pending". Never overwrites an existing file.
 * Usage: node scripts/research/team-files.ts <event-id>
 */
import { existsSync, writeFileSync } from 'node:fs'
import { EventConfig, EventTeams, TeamForm, TeamRegistry } from '../../data/schemas/index.ts'
import { readJson, repoPath } from '../lib/files.ts'

const eventId = process.argv[2]
if (!eventId) {
  console.error('Usage: node scripts/research/team-files.ts <event-id>')
  process.exit(1)
}

const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
const eventTeams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
const names = new Map(eventTeams.participants.map((p) => [p.teamId, p.displayName]))
const today = new Date().toISOString().slice(0, 10)

for (const participant of eventTeams.participants) {
  const path = repoPath('data/teams', `${participant.teamId}.md`)
  if (existsSync(path)) {
    console.log(`${participant.teamId}: exists, left unchanged`)
    continue
  }
  const team = registry.teams.find((t) => t.id === participant.teamId)
  const form = readJson(repoPath('data/teams/form', `${participant.teamId}.json`), TeamForm)
  const stage = config.stages.find((s) => s.id === participant.entryStage)
  const s = form.summary
  const vsEvent = form.recent.filter((r) =>
    [...names.values(), ...registry.teams.map((t) => t.vrsName ?? '')].includes(r.opponent),
  )
  const aliases = team?.aliases.map((a) => (a.context ? `${a.name} (${a.context})` : a.name)) ?? []

  const lines = [
    `# ${team?.name ?? participant.teamId}  (id: ${participant.teamId})`,
    '',
    `Event name: ${participant.displayName}${aliases.length ? ` · aliases: ${aliases.join(', ')}` : ''}`,
    `VRS #${form.vrs.rank}, ${form.vrs.points} points (${form.asOf}) · ${stage?.name ?? participant.entryStage}, seed ${participant.stageSeed} · Last updated ${today}`,
    '',
    '## Lineup',
    `- Players in the latest VRS match (${form.recent[0]?.date ?? 'n/a'}): ${form.roster.join(', ') || 'unknown'} [VRS]`,
    '- Coach, join dates, stand-ins: pending (Liquipedia API)',
    '',
    '## Roster changes',
    '- pending (Liquipedia API, news)',
    '',
    '## Recent form',
    `- Last 90 days: ${s.last90Days.won}-${s.last90Days.lost} in series [VRS]`,
    `- Vs VRS top 30 (6 months): ${s.vsTop30.won}-${s.vsTop30.lost} [VRS]`,
    `- Series vs VRS top 50 (6 months): ${s.tier1Series}${s.tier1Series < 8 ? ' (cold start: wider uncertainty)' : ''} [VRS]`,
    '- Last 10 series:',
    ...form.recent
      .slice(0, 10)
      .map(
        (r) =>
          `  - ${r.date} ${r.result} vs ${r.opponent}${r.opponentRank ? ` (#${r.opponentRank})` : ''}`,
      ),
    '- Placements: pending',
    '',
    '## Map pool',
    '- pending (HLTV map stats, Browser pane). Until then all maps use the team rating.',
    '',
    '## Key players',
    '- pending',
    '',
    '## Head-to-head (this event, last 6 months)',
    ...(vsEvent.length
      ? vsEvent.map((r) => `- ${r.date} ${r.result} vs ${r.opponent} [VRS]`)
      : ['- none in the last 20 VRS series']),
    '',
    '## Context',
    '- Major experience, travel/jet lag, Bo1 vs Bo3: pending',
    '',
    '## Strengths / weaknesses / storylines',
    '- pending',
    '',
    '## Modifiers',
    '- none',
    '',
    '## Sources',
    `- [VRS] ${form.source.name}, ${form.source.url ?? ''} (retrieved ${form.source.retrievedAt})`,
    '',
  ]
  writeFileSync(path, lines.join('\n'))
  console.log(`${participant.teamId}: written`)
}
