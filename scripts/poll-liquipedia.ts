/**
 * Poller (launchd, no Claude usage): reads the current stage page from the Liquipedia API, logs new
 * results through the shared pipeline, and saves the pre-round snapshot as soon as a round can start.
 * When a Swiss stage finishes, it seeds the advancing teams into the next stage and saves that
 * stage's round 1 snapshot.
 * Usage: node --env-file-if-exists=.env scripts/poll-liquipedia.ts <event-id> [stage-id] [--commit]
 * Without a stage id it picks the first unfinished, fully seeded Swiss stage whose dates (±1 day)
 * contain today; failing that, the seeded playoffs (±1 day) until the final is decided; or exits
 * quietly.
 * With --commit it validates all data and commits + pushes data changes to main when something new
 * was logged, a snapshot was saved, or teams advanced.
 */
import {
  EventConfig,
  type PlayoffStage,
  type SwissStage,
  TeamRegistry,
} from '../data/schemas/index.ts'
import { roundCount } from '../engine/playoffs/bracket.ts'
import { realBracket } from '../engine/playoffs/simulate-playoffs.ts'
import { currentPlayoffRound } from '../engine/predict-playoffs.ts'
import { stageSeeds } from '../engine/swiss/stage-seeds.ts'
import { isSwissStageFinished, isSwissStageSeeded } from './lib/advance.ts'
import { isPlayoffStageSeeded, loadEventData } from './lib/event-context.ts'
import { readJson, repoPath } from './lib/files.ts'
import { commitData } from './lib/git.ts'
import { getPage } from './lib/liquipedia.ts'
import { readBracketPage } from './lib/liquipedia-results.ts'
import {
  appendChangelog,
  ensureRoundSnapshot,
  type LogOutcome,
  logResults,
} from './lib/log-results.ts'
import { collectClosingOdds, isOddsWindow } from './lib/oddspapi.ts'
import {
  type AdvanceStep,
  advanceAndSnapshot,
  applySwissPage,
  convertOptions,
} from './lib/poll-stage.ts'
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
/** Results held back this run (e.g. a match whose maps don't fit its format yet), for the status. */
const heldBack: string[] = []
/** Market-odds notes this run (unmatched teams, a failed call), for the status. */
const oddsNotes: string[] = []

/** Reports a stage that just finished and moved its teams on (see advanceAndSnapshot). */
function reportAdvance(stageId: string, step: AdvanceStep): void {
  if (step.advance.status !== 'advanced') return
  const { teams, nextStageId } = step.advance
  log(`${stageId} finished: ${teams.join(', ')} advance to ${nextStageId}`)
  log(`${nextStageId} round 1 snapshot ${step.snapshot}`)
  changes.push(`${stageName(stageId)} finished, 8 teams moved to ${stageName(nextStageId)}`)
}

const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
const stageName = (id: string) => config.stages.find((s) => s.id === id)?.name ?? id
const today = new Date().toISOString().slice(0, 10)

// Late-run guardrail: launchd catches up after sleep, so only act inside a stage window (±1 day).
let stage: SwissStage | PlayoffStage | undefined
let revid: number | undefined
try {
  // Inside the try: advancing a stage or reading the playoff bracket can fail too, and every failure
  // must reach the status file.
  stage = pickStage()
  if (stage?.liquipediaPage) {
    revid = await poll(stage, stage.liquipediaPage)
  } else {
    log(`${eventId}: no unfinished stage to poll on ${today}, nothing to do`)
  }
  // Results first, in their own commit: the market-odds step can never delay or block them.
  commitIfChanged(changes)
  commitIfChanged(await collectMarketOdds())
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
    ...statusMessage(),
  },
  changes.length > 0 ? changes.join('; ') : undefined,
)

/** The stage to poll today: an unfinished Swiss stage (advancing finished ones), else the playoffs. */
function pickStage(): SwissStage | PlayoffStage | undefined {
  const id = eventId as string
  const candidates = config.stages.filter((s): s is SwissStage =>
    stageArg
      ? s.id === stageArg && s.type === 'swiss'
      : s.type === 'swiss' && today >= shift(s.start, -1) && today <= shift(s.end, 1),
  )
  for (const candidate of candidates) {
    if (isSwissStageFinished(id, candidate.id)) {
      reportAdvance(candidate.id, advanceAndSnapshot(id, candidate.id))
      continue
    }
    if (!isSwissStageSeeded(id, candidate.id)) continue
    return candidate
  }
  // No Swiss stage to poll: the playoffs, once seeded and until the final is decided.
  return config.stages.find(
    (s): s is PlayoffStage =>
      s.type === 'single-elimination' &&
      (stageArg ? s.id === stageArg : today >= shift(s.start, -1) && today <= shift(s.end, 1)) &&
      isPlayoffStageOpen(id, s),
  )
}

/** Reads one stage page and logs what is new. Returns the Liquipedia revision that was read. */
async function poll(current: SwissStage | PlayoffStage, pageTitle: string): Promise<number> {
  const stageId = current.id
  const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
  const page = await getPage(pageTitle)
  const convert = convertOptions(config, registry, stageId, {
    name: `Liquipedia: ${page.title} (rev ${page.revid})`,
    url: `https://liquipedia.net/counterstrike/${page.title.replaceAll(' ', '_')}`,
    retrievedAt: today,
    license: 'CC-BY-SA 3.0',
  })

  if (current.type === 'single-elimination') {
    const { results, skipped } = readBracketPage(page.text, convert)
    for (const note of skipped) log(`${stageId}: skipped ${note}`)
    const outcome = logResults(eventId as string, stageId, results, 'poll-liquipedia')
    const snapshot =
      outcome.logged.length > 0 ? outcome.snapshot : ensureRoundSnapshot(eventId as string, stageId)
    report(current, page.revid, outcome, snapshot)
    return page.revid
  }

  const outcome = applySwissPage(eventId as string, stageId, page.text, convert, 'poll-liquipedia')
  report(current, page.revid, outcome, outcome.snapshot)
  if (outcome.drawSaved !== undefined) {
    log(`${stageId}: round ${outcome.drawSaved} draw stored`)
    changes.push(`${current.name} round ${outcome.drawSaved} draw`)
  }
  reportAdvance(stageId, outcome.next)
  return page.revid
}

function report(
  current: SwissStage | PlayoffStage,
  revid: number,
  outcome: LogOutcome,
  snapshot: LogOutcome['snapshot'],
): void {
  log(
    `${current.id} rev ${revid}: ${outcome.logged.length} new, ${outcome.skipped.length} known, snapshot ${snapshot}`,
  )
  for (const note of outcome.held) log(`${current.id}: held back ${note}`)
  heldBack.push(...outcome.held)
  const n = outcome.logged.length
  if (n > 0) changes.push(`${n} new result${n === 1 ? '' : 's'} in ${current.name}`)
  if (snapshot === 'saved') changes.push(`next-round prediction saved for ${current.name}`)
  if (outcome.lastChanceSnapshot === 'saved') {
    changes.push(`${current.name} prediction saved just before its round's first results`)
  }
}

function statusMessage(): { message?: string } {
  const parts = [
    ...(heldBack.length > 0 ? [`Held back: ${heldBack.join('; ')}`] : []),
    ...oddsNotes,
  ]
  return parts.length > 0 ? { message: parts.join('; ').slice(0, 300) } : {}
}

/**
 * Closing-line market odds for newly logged results (a benchmark only), every second hour. A failure
 * here never fails the check: it is logged and shown in the status message, and the next window
 * tries again.
 */
async function collectMarketOdds(): Promise<string[]> {
  if (!isOddsWindow(new Date())) return []
  try {
    const odds = await collectClosingOdds(eventId as string, today)
    for (const note of odds.notes) log(note)
    oddsNotes.push(...odds.notes)
    if (odds.added > 0) {
      const what = `market odds for ${odds.added} match${odds.added === 1 ? '' : 'es'}`
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
      appendChangelog(`- ${stamp} UTC · poll-liquipedia · ${what} (OddsPapi closing line)`)
      return [what]
    }
  } catch (error) {
    log(`market odds failed: ${String(error)}`)
    oddsNotes.push(`market odds failed: ${String(error).slice(0, 120)}`)
  }
  return []
}

/** Seeded and the final not decided yet. */
function isPlayoffStageOpen(id: string, playoffs: PlayoffStage): boolean {
  const event = loadEventData(id)
  if (!isPlayoffStageSeeded(event, playoffs)) return false
  const seeds = stageSeeds(event.teams.participants, playoffs.id)
  const played = event.results.matches.filter((m) => m.stageId === playoffs.id)
  const bracket = realBracket(seeds, playoffs, played)
  return currentPlayoffRound(bracket, roundCount(playoffs)) <= roundCount(playoffs)
}

function commitIfChanged(changes: readonly string[]): void {
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
    // In the cloud the runner is thrown away, so an unpushed commit is lost: fail the run loudly.
    if (!commit.pushed) process.exitCode = 1
  } else {
    log(`commit ${commit.status}${commit.status === 'skipped' ? `: ${commit.reason}` : ''}`)
  }
}
