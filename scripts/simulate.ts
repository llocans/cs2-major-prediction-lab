/**
 * Simulates the rest of a Swiss stage and prints the odds. Writes nothing.
 * Usage: node scripts/simulate.ts <event-id> <stage-id>
 */
import { predictStage } from '../engine/predict.ts'
import { loadStageContext } from './lib/event-context.ts'

const [eventId, stageId] = process.argv.slice(2)
if (!eventId || !stageId) {
  console.error('Usage: node scripts/simulate.ts <event-id> <stage-id>')
  process.exit(1)
}

const started = performance.now()
const context = loadStageContext(eventId, stageId)
const prediction = predictStage(context.simInput, context.labels)
const pct = (p: number) => `${(p * 100).toFixed(1).padStart(5)}%`

console.log(`${context.config.name} · ${context.stage.name} · round ${prediction.sim.currentRound}`)
console.log(
  `${prediction.sim.runs} runs, max SE ${(prediction.sim.maxStandardError * 100).toFixed(2)} pp, ${Math.round(performance.now() - started)} ms\n`,
)
console.log(
  `${'Team'.padEnd(20)}${'3-0'.padStart(7)}${'Adv'.padStart(7)}${'0-3'.padStart(7)}  conf`,
)
for (const team of [...prediction.teams].sort((a, b) => b.pAdvance - a.pAdvance)) {
  console.log(
    `${context.labels.team(team.teamId).padEnd(20)}${pct(team.p30)}  ${pct(team.pAdvance)}  ${pct(team.p03)}  ${team.confidence}`,
  )
}
console.log('\nNext matches')
for (const match of prediction.matches) {
  console.log(
    `${context.labels.team(match.teamA)} ${pct(match.pA)} vs ${context.labels.team(match.teamB)} (${match.format}, ${match.confidence}): ${match.reason}`,
  )
}
