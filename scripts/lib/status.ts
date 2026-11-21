import { writeFileSync } from 'node:fs'
import type { StagePrediction } from '../../engine/predict.ts'
import type { StageContext } from './event-context.ts'
import { repoPath } from './files.ts'

/** Writes data/events/<id>/status.md: a short, generated summary of the event state. */
export function writeStatus(context: StageContext, prediction: StagePrediction): void {
  const { labels } = context
  const pct = (p: number) => `${Math.round(p * 100)}%`
  const round = prediction.sim.currentRound
  const played = context.simInput.played
  const last = [...context.results.matches].filter((m) => m.stageId === context.stage.id).slice(-4)
  const top = [...prediction.teams].sort((a, b) => b.pAdvance - a.pAdvance)

  const lines = [
    `# ${context.config.name}: status`,
    '',
    `Generated ${new Date().toISOString()} by scripts. Do not edit by hand.`,
    '',
    `- Stage: ${context.stage.name}, ${round > 5 ? 'finished' : `round ${round} next`}`,
    `- Results logged in this stage: ${played.length}`,
    `- Model ${context.params.version}, ${prediction.sim.runs} runs, max SE ${(prediction.sim.maxStandardError * 100).toFixed(2)} pp`,
    '',
    '## Latest results',
    ...(last.length === 0
      ? ['- none yet']
      : last.map(
          (m) =>
            `- R${m.round}: ${labels.team(m.winner)} beat ${labels.team(m.winner === m.teamA ? m.teamB : m.teamA)} (${m.format})`,
        )),
    '',
    '## Next matches',
    ...(prediction.matches.length === 0
      ? ['- none scheduled']
      : prediction.matches.map(
          (m) =>
            `- ${labels.team(m.teamA)} ${pct(m.pA)} vs ${labels.team(m.teamB)} (${m.format}, ${m.confidence})`,
        )),
    '',
    '## Advance odds',
    ...top.map((t) => `- ${labels.team(t.teamId)} (${t.record}): ${pct(t.pAdvance)}`),
    '',
  ]
  writeFileSync(repoPath('data/events', context.eventId, 'status.md'), lines.join('\n'))
}
