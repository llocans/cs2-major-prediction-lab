/**
 * Poller (launchd, no Claude usage): reads the current stage page from the Liquipedia API, logs new
 * results through the shared pipeline, and saves the pre-round snapshot as soon as a round can start.
 * Usage: node --env-file-if-exists=.env scripts/poll-liquipedia.ts <event-id> [stage-id]
 * Without a stage id it picks the Swiss stage whose dates (±1 day) contain today, or exits quietly.
 */
import { EventConfig, TeamRegistry } from '../data/schemas/index.ts'
import { readJson, repoPath } from './lib/files.ts'
import { getPage } from './lib/liquipedia.ts'
import { readStagePage } from './lib/liquipedia-results.ts'
import { ensureRoundSnapshot, logResults } from './lib/log-results.ts'

const [eventId, stageArg] = process.argv.slice(2)
if (!eventId) {
  console.error('Usage: node scripts/poll-liquipedia.ts <event-id> [stage-id]')
  process.exit(1)
}

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`)
const shift = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10)

const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
const today = new Date().toISOString().slice(0, 10)
// Late-run guardrail: launchd catches up after sleep, so only act inside a stage window (±1 day).
const stage = config.stages.find((s) =>
  stageArg ? s.id === stageArg : today >= shift(s.start, -1) && today <= shift(s.end, 1),
)
if (!stage) {
  log(`${eventId}: no stage running on ${today}, nothing to do`)
  process.exit(0)
}
if (stage.type !== 'swiss' || !stage.liquipediaPage) {
  log(`${eventId}/${stage.id}: not a Swiss stage with a liquipediaPage, nothing to do`)
  process.exit(0)
}
const stageId = stage.id

const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
const teamByLiquipedia = new Map(
  registry.teams.filter((t) => t.liquipedia).map((t) => [t.liquipedia?.toLowerCase(), t.id]),
)
const mapByName = new Map(config.mapPool.map((map) => [map.name.toLowerCase(), map.id]))

const page = await getPage(stage.liquipediaPage)
const data = readStagePage(page.text, {
  stageId,
  resolveTeam: (name) => {
    const id = teamByLiquipedia.get(name)
    if (!id) throw new Error(`Liquipedia team "${name}" has no "liquipedia" entry in registry.json`)
    return id
  },
  resolveMap: (name) => {
    const id = mapByName.get(name.toLowerCase())
    if (!id) throw new Error(`Liquipedia map "${name}" is not in the event map pool`)
    return id
  },
  source: {
    name: `Liquipedia: ${page.title} (rev ${page.revid})`,
    url: `https://liquipedia.net/counterstrike/${page.title.replaceAll(' ', '_')}`,
    retrievedAt: today,
    license: 'CC-BY-SA 3.0',
  },
})

const outcome = logResults(eventId, stageId, data.results, 'poll-liquipedia', data.announced)
const snapshot =
  outcome.logged.length > 0
    ? outcome.snapshot
    : ensureRoundSnapshot(eventId, stageId, data.announced)
log(
  `rev ${page.revid}: ${outcome.logged.length} new, ${outcome.skipped.length} known, snapshot ${snapshot}`,
)
