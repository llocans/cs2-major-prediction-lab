/**
 * Simulates the rest of a stage and prints the odds. Writes nothing. A Swiss stage also plays out the
 * rest of the event (playoff and title odds); the playoff stage prints its bracket odds once seeded.
 * Usage: node scripts/simulate.ts <event-id> <stage-id> [--model <version>]
 * (`--model`: another model version than the stage's own, e.g. one scored alongside it)
 */
import type { MatchPrediction } from '../data/schemas/snapshot.ts'
import { predictStage } from '../engine/predict.ts'
import { predictPlayoffs } from '../engine/predict-playoffs.ts'
import {
  isPlayoffStageSeeded,
  loadEventData,
  loadPlayoffContext,
  loadStageContext,
} from './lib/event-context.ts'

const args = process.argv.slice(2)
const modelFlag = args.indexOf('--model')
const version = modelFlag >= 0 ? args[modelFlag + 1] : undefined
const [eventId, stageId] = args.filter(
  (_, i) => modelFlag < 0 || (i !== modelFlag && i !== modelFlag + 1),
)
if (!eventId || !stageId || (modelFlag >= 0 && !version)) {
  console.error('Usage: node scripts/simulate.ts <event-id> <stage-id> [--model <version>]')
  process.exit(1)
}
const versionOption = version === undefined ? {} : { version }

const started = performance.now()
const pct = (p: number) => `${(p * 100).toFixed(1).padStart(5)}%`
const optional = (p: number | undefined) => (p === undefined ? '     –' : pct(p))
const stageType = loadEventData(eventId).config.stages.find((s) => s.id === stageId)?.type
if (stageType === 'single-elimination') printPlayoffs()
else printSwiss()

function printUnverified(formats: readonly string[]) {
  if (formats.length > 0) {
    console.log(
      `\nThe final is ${formats.join('/').toUpperCase()} (confirmed); title odds assume its ban/pick order, not published yet (docs/rules.md).`,
    )
  }
}

function printMatches(matches: readonly MatchPrediction[], team: (id: string) => string) {
  console.log('\nNext matches')
  if (matches.length === 0) console.log('none')
  for (const match of matches) {
    console.log(
      `${team(match.teamA)} ${pct(match.pA)} vs ${team(match.teamB)} (${match.format}, ${match.confidence}): ${match.reason}`,
    )
  }
}

function printPlayoffs() {
  const event = loadEventData(eventId as string)
  const stage = event.config.stages.find((s) => s.id === stageId)
  if (stage?.type === 'single-elimination' && !isPlayoffStageSeeded(event, stage)) {
    console.log(
      `${stage.name}: seeds not set yet. Run the last Swiss stage for projected playoff and title odds.`,
    )
    return
  }
  const context = loadPlayoffContext(eventId as string, stageId as string, versionOption)
  const prediction = predictPlayoffs(context.simInput, context.labels)
  const { sim } = prediction
  console.log(
    `${context.config.name} · ${context.stage.name} · round ${prediction.currentRound} · model ${context.params.version}`,
  )
  console.log(
    `${sim.runs} runs, max SE ${(sim.maxStandardError * 100).toFixed(2)} pp, ${Math.round(performance.now() - started)} ms\n`,
  )
  console.log(
    `${'Team'.padEnd(20)}${'Semi'.padStart(7)}${'Final'.padStart(7)}${'Title'.padStart(7)}${'3rd'.padStart(7)}`,
  )
  for (const team of [...prediction.teams].sort((a, b) => b.pTitle - a.pTitle)) {
    console.log(
      `${context.labels.team(team.teamId).padEnd(20)}${pct(team.pSemifinal)}  ${pct(team.pFinal)}  ${pct(team.pTitle)}  ${optional(team.pThird)}`,
    )
  }
  printUnverified(prediction.unverifiedVeto)
  printMatches(prediction.matches, context.labels.team)
}

function printSwiss() {
  const context = loadStageContext(eventId as string, stageId as string, versionOption)
  const prediction = predictStage(context.simInput, context.labels, context.chain)

  console.log(
    `${context.config.name} · ${context.stage.name} · round ${prediction.sim.currentRound} · model ${context.params.version}`,
  )
  console.log(
    `${prediction.sim.runs} runs, max SE ${(prediction.sim.maxStandardError * 100).toFixed(2)} pp, ${Math.round(performance.now() - started)} ms\n`,
  )
  console.log(
    `${'Team'.padEnd(20)}${'3-0'.padStart(7)}${'Adv'.padStart(7)}${'0-3'.padStart(7)}${'Plf'.padStart(7)}${'Title'.padStart(7)}  conf`,
  )
  for (const team of [...prediction.teams].sort((a, b) => b.pAdvance - a.pAdvance)) {
    console.log(
      `${context.labels.team(team.teamId).padEnd(20)}${pct(team.p30)}  ${pct(team.pAdvance)}  ${pct(team.p03)}  ${optional(team.pPlayoffs)}  ${optional(team.pTitle)}  ${team.confidence}`,
    )
  }
  printUnverified(prediction.event?.unverifiedVeto ?? [])
  printMatches(prediction.matches, context.labels.team)
}
