/**
 * Team logos from Liquipedia's TeamShort team template, saved as small copies (scaled by Liquipedia
 * to fit 120x80 px) in site/public/logos/:
 * - each team's own logo (template without a date) → `logo` in data/teams/registry.json,
 *   files `logos/<team-id>.png` (+ `-dark.png` when the team has a separate dark-theme logo);
 * - for a team that plays under another name at this event (`shortName` in its teams.json, e.g.
 *   GOSH for BC.Game), the logo from the template dated to its first stage, when it differs →
 *   `logo` in the event's teams.json, files `logos/<event-id>/<team-id>.png`. Only for renamed
 *   teams: for the others Liquipedia's dated history can point to an older or a wordmark logo.
 * Downloads only logos that are new or changed. Requests: one expandtemplates, one query per 50
 * files, one download per new file, all at Liquipedia's pace.
 * Usage: node --env-file-if-exists=.env scripts/research/team-logos.ts <event-id>
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  EventConfig,
  EventTeams,
  type LogoFiles,
  TeamRegistry,
  teamLogoPaths,
} from '../../data/schemas/index.ts'
import { readJson, repoPath, writeJson } from '../lib/files.ts'
import { downloadFile, expandTemplates, imageThumbUrls } from '../lib/liquipedia.ts'
import { parseTeamLogoLines } from '../lib/wikitext.ts'

/** Twice the largest size the site shows (the team panel heading), for sharp high-DPI screens. */
const BOX = { width: 120, height: 80 }

const [eventId] = process.argv.slice(2)
if (!eventId) {
  console.error('Usage: node scripts/research/team-logos.ts <event-id>')
  process.exit(1)
}

const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
const eventTeams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
const today = new Date().toISOString().slice(0, 10)

interface Job {
  team: TeamRegistry['teams'][number]
  participant: EventTeams['participants'][number]
  date: string
}
const jobs: Job[] = []
for (const participant of eventTeams.participants) {
  const team = registry.teams.find((t) => t.id === participant.teamId)
  const date = config.stages.find((s) => s.id === participant.entryStage)?.start
  if (!team?.liquipedia || !date) {
    console.error(`${participant.teamId}: no "liquipedia" key or entry stage date, skipped`)
    continue
  }
  jobs.push({ team, participant, date })
}

const text = jobs
  .flatMap(({ team, participant, date }) => [
    `${team.id}={{TeamShort|${team.liquipedia}}}`,
    ...(participant.shortName ? [`${team.id}@event={{TeamShort|${team.liquipedia}|${date}}}`] : []),
  ])
  .join('\n')
const found = parseTeamLogoLines(await expandTemplates(text))

type Files = { light: string; dark?: string }
const local = (path: string) => repoPath('site/public', path)
const same = (a: Files | undefined, b: Files | undefined) =>
  a?.light === b?.light && a?.dark === b?.dark
/** The files for these paths are all on disk. */
const onDisk = (paths: Files | undefined) =>
  paths !== undefined && Object.values(paths).every((path) => existsSync(local(path)))

interface Target {
  label: string
  teamId: string
  eventId?: string
  logo: Files
  current: LogoFiles | undefined
  save: (logo: LogoFiles) => void
}
const targets: Target[] = []
for (const { team, participant } of jobs) {
  const own = found.get(team.id)
  const atEvent = found.get(`${team.id}@event`)
  if (!own) {
    console.error(`${team.id}: no logo in TeamShort|${team.liquipedia}, left unchanged`)
    continue
  }
  targets.push({
    label: team.id,
    teamId: team.id,
    logo: own,
    current: team.logo,
    save: (logo) => {
      team.logo = logo
    },
  })
  if (atEvent && !same(atEvent, own)) {
    targets.push({
      label: `${team.id} @ event`,
      teamId: team.id,
      eventId,
      logo: atEvent,
      current: participant.logo,
      save: (logo) => {
        participant.logo = logo
      },
    })
  } else if (participant.logo) {
    // The event no longer has its own logo for this team: drop it and its files.
    for (const path of Object.values(teamLogoPaths(team.id, participant.logo, eventId) ?? {})) {
      rmSync(local(path), { force: true })
    }
    delete participant.logo
    console.log(`${team.id} @ event: own event logo removed`)
  }
}

const changed = targets.filter(
  (t) => !same(t.current, t.logo) || !onDisk(teamLogoPaths(t.teamId, t.logo, t.eventId)),
)
const files = [...new Set(changed.flatMap((t) => Object.values(t.logo)))]
const urls = files.length > 0 ? await imageThumbUrls(files, BOX) : new Map<string, string>()

for (const target of targets) {
  const { logo, teamId } = target
  if (!changed.includes(target)) {
    console.log(`${target.label.padEnd(18)} unchanged`)
    continue
  }
  const paths = teamLogoPaths(teamId, logo, target.eventId)
  const light = urls.get(logo.light)
  const dark = logo.dark === undefined ? undefined : urls.get(logo.dark)
  if (!paths || !light || (logo.dark !== undefined && !dark)) {
    console.error(
      `${target.label}: Liquipedia has no image info for ${Object.values(logo).join(', ')}`,
    )
    continue
  }
  if (![light, dark].every((url) => url === undefined || url.toLowerCase().endsWith('.png'))) {
    console.error(`${target.label}: logo is not a PNG (${light}), left unchanged`)
    continue
  }
  mkdirSync(dirname(local(paths.light)), { recursive: true })
  writeFileSync(local(paths.light), await downloadFile(light))
  if (paths.dark && dark) writeFileSync(local(paths.dark), await downloadFile(dark))
  else rmSync(local(paths.light.replace(/\.png$/, '-dark.png')), { force: true })
  const team = registry.teams.find((t) => t.id === teamId)
  const where = target.eventId ? ` dated to ${eventId}` : ''
  target.save({
    ...logo,
    source: {
      name: `Liquipedia file ${Object.values(logo).join(' / ')} (TeamShort|${team?.liquipedia}${where})`,
      url: `https://liquipedia.net/commons/File:${encodeURIComponent(logo.light.replaceAll(' ', '_'))}`,
      retrievedAt: today,
      license: 'Team trademark; not CC BY-SA (shown only to identify the team)',
    },
  })
  const note = /temporary/i.test(logo.light) ? '  (Liquipedia marks this logo temporary)' : ''
  console.log(`${target.label.padEnd(18)} ${Object.values(logo).join(' | ')}${note}`)
}

writeJson(repoPath('data/teams/registry.json'), TeamRegistry, registry)
writeJson(repoPath('data/events', eventId, 'teams.json'), EventTeams, eventTeams)
