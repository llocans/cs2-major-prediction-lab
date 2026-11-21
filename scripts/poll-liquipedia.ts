/**
 * Poller (launchd, no Claude usage): reads the current stage page from the Liquipedia API, logs new
 * results through the shared pipeline, and saves the pre-round snapshot as soon as a round can start.
 * When a Swiss stage finishes, it seeds the advancing teams into the next stage and saves that
 * stage's round 1 snapshot.
 * Usage: node --env-file-if-exists=.env scripts/poll-liquipedia.ts <event-id> [stage-id] [--commit]
 * Without a stage id it picks the first unfinished, fully seeded Swiss stage whose dates (±1 day)
 * contain today, or exits quietly.
 * With --commit it validates all data and commits + pushes data changes to main when something new
 * was logged, a snapshot was saved, or teams advanced.
 */
import { EventConfig, type SwissStage, TeamRegistry } from '../data/schemas/index.ts'
import { advanceStage, isSwissStageFinished, isSwissStageSeeded } from './lib/advance.ts'
import { readJson, repoPath } from './lib/files.ts'
import { commitData } from './lib/git.ts'
import { getPage } from './lib/liquipedia.ts'
import { readStagePage } from './lib/liquipedia-results.ts'
import { ensureRoundSnapshot, logResults } from './lib/log-results.ts'
import { writeSyncStatus } from './lib/sync-status.ts'
import { validateAllData } from './lib/validate-data.ts'

const args = process.argv.slice(2)
const shouldCommit = args.includes('--commit')
const [eventId, stageArg] = args.filter((arg) => !arg.startsWith('--'))
if (!eventId) {
  console.error('Usage: node scripts/poll-liquipedia.ts <event-id> [stage-id] [--commit]')
  process.exit(1)
}

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`)
const shift = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10)
const changes: string[] = []

/** Seeds the next stage once a Swiss stage is finished, and snapshots its first round. */
function advanceIfFinished(stageId: string): void {
  const outcome = advanceStage(eventId as string, stageId)
  if (outcome.status !== 'advanced') return
  log(`${stageId} finished: ${outcome.teams.join(', ')} advance to ${outcome.nextStageId}`)
  const snapshot = ensureRoundSnapshot(eventId as string, outcome.nextStageId)
  log(`${outcome.nextStageId} round 1 snapshot ${snapshot}`)
  changes.push(`${stageId} advanced to ${outcome.nextStageId}`)
}

const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
const today = new Date().toISOString().slice(0, 10)

// Late-run guardrail: launchd catches up after sleep, so only act inside a stage window (±1 day).
const candidates = config.stages.filter((s): s is SwissStage =>
  stageArg
    ? s.id === stageArg && s.type === 'swiss'
    : s.type === 'swiss' && today >= shift(s.start, -1) && today <= shift(s.end, 1),
)
let stage: SwissStage | undefined
for (const candidate of candidates) {
  if (isSwissStageFinished(eventId, candidate.id)) {
    advanceIfFinished(candidate.id)
    continue
  }
  if (!isSwissStageSeeded(eventId, candidate.id)) continue
  stage = candidate
  break
}

let revid: number | undefined
try {
  if (stage?.liquipediaPage) {
    revid = await poll(stage, stage.liquipediaPage)
  } else {
    log(`${eventId}: no unfinished Swiss stage to poll on ${today}, nothing to do`)
  }
  commitIfChanged()
} catch (error) {
  // Record the failure for the site's freshness bar, then fail loudly for launchd's log.
  writeSyncStatus({
    eventId,
    outcome: 'error',
    ...(stage ? { stageId: stage.id } : {}),
    message: String(error).slice(0, 300),
  })
  throw error
}
writeSyncStatus(
  {
    eventId,
    outcome: stage ? 'checked' : 'idle',
    ...(stage ? { stageId: stage.id } : {}),
    ...(revid !== undefined ? { liquipediaRevid: revid } : {}),
  },
  changes.length > 0 ? changes.join('; ') : undefined,
)

/** Reads one stage page and logs what is new. Returns the Liquipedia revision that was read. */
async function poll(current: SwissStage, pageTitle: string): Promise<number> {
  const stageId = current.id
  const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
  const teamByLiquipedia = new Map(
    registry.teams.filter((t) => t.liquipedia).map((t) => [t.liquipedia?.toLowerCase(), t.id]),
  )
  const mapByName = new Map(config.mapPool.map((map) => [map.name.toLowerCase(), map.id]))

  const page = await getPage(pageTitle)
  const data = readStagePage(page.text, {
    stageId,
    resolveTeam: (name) => {
      const id = teamByLiquipedia.get(name)
      if (!id)
        throw new Error(`Liquipedia team "${name}" has no "liquipedia" entry in registry.json`)
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

  const outcome = logResults(
    eventId as string,
    stageId,
    data.results,
    'poll-liquipedia',
    data.announced,
  )
  const snapshot =
    outcome.logged.length > 0
      ? outcome.snapshot
      : ensureRoundSnapshot(eventId as string, stageId, data.announced)
  log(
    `${stageId} rev ${page.revid}: ${outcome.logged.length} new, ${outcome.skipped.length} known, snapshot ${snapshot}`,
  )
  if (outcome.logged.length > 0) changes.push(`${stageId} ${outcome.logged.length} result(s)`)
  if (snapshot === 'saved') changes.push(`${stageId} snapshot`)
  advanceIfFinished(stageId)
  return page.revid
}

function commitIfChanged(): void {
  if (!shouldCommit || changes.length === 0) return
  const { problems } = validateAllData()
  if (problems.length > 0) {
    log(`NOT committing: validation failed\n${problems.join('\n')}`)
    process.exit(1)
  }
  const commit = commitData(`data: ${changes.join('; ')} (poller)`)
  if (commit.status === 'committed') {
    log(
      `committed ${commit.sha}${commit.pushed ? ' and pushed' : `; push failed: ${commit.pushError}`}`,
    )
  } else {
    log(`commit ${commit.status}${commit.status === 'skipped' ? `: ${commit.reason}` : ''}`)
  }
}
