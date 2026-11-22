import { writeFileSync } from 'node:fs'
import { roundCount } from '../../engine/playoffs/bracket.ts'
import type { StagePrediction } from '../../engine/predict.ts'
import type { PlayoffPrediction } from '../../engine/predict-playoffs.ts'
import type { PlayoffContext, StageContext } from './event-context.ts'
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
    ...titleLines(prediction, labels.team),
  ]
  writeFileSync(repoPath('data/events', context.eventId, 'status.md'), lines.join('\n'))
}

/** Top title odds across the whole event, with a note when a veto procedure is assumed. */
function titleLines(prediction: StagePrediction, name: (id: string) => string): string[] {
  const teams = prediction.event?.teams.filter((t) => t.pTitle !== undefined) ?? []
  if (teams.length === 0) return []
  const top = [...teams].sort((a, b) => (b.pTitle ?? 0) - (a.pTitle ?? 0)).slice(0, 8)
  const unverified = prediction.event?.unverifiedVeto ?? []
  return [
    '## Title odds (whole event, top 8)',
    ...top.map(
      (t) =>
        `- ${name(t.teamId)}: ${((t.pTitle ?? 0) * 100).toFixed(1)}% (playoffs ${Math.round(t.pPlayoffs * 100)}%)`,
    ),
    ...(unverified.length > 0
      ? ['', `Assumes an unverified ${unverified.join('/').toUpperCase()} veto (docs/rules.md).`]
      : []),
    '',
  ]
}

/** status.md for a single-elimination stage: bracket progress, next matches, title odds. */
export function writePlayoffStatus(context: PlayoffContext, prediction: PlayoffPrediction): void {
  const { labels } = context
  const pct = (p: number) => `${Math.round(p * 100)}%`
  const rounds = roundCount(context.stage)
  const round = prediction.currentRound
  const roundName = (r: number) =>
    r === rounds
      ? 'final'
      : r === rounds - 1
        ? 'semifinals'
        : r === rounds - 2
          ? 'quarterfinals'
          : `round ${r}`
  const decided = prediction.sim.bracket.filter((m) => m.winner !== undefined)
  const top = [...prediction.teams].sort((a, b) => b.pTitle - a.pTitle)

  const lines = [
    `# ${context.config.name}: status`,
    '',
    `Generated ${new Date().toISOString()} by scripts. Do not edit by hand.`,
    '',
    `- Stage: ${context.stage.name}, ${round > rounds ? 'finished' : `${roundName(round)} next`}`,
    `- Results logged in this stage: ${decided.length}`,
    `- Model ${context.params.version}, ${prediction.sim.runs} runs, max SE ${(prediction.sim.maxStandardError * 100).toFixed(2)} pp`,
    '',
    '## Results',
    ...(decided.length === 0
      ? ['- none yet']
      : decided.map(
          (m) =>
            `- ${m.thirdPlace ? 'third place' : roundName(m.round)}: ${labels.team(m.winner ?? '')} beat ${labels.team((m.winner === m.teamA ? m.teamB : m.teamA) ?? '')}`,
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
    '## Title odds',
    ...top.map((t) => `- ${labels.team(t.teamId)}: ${(t.pTitle * 100).toFixed(1)}% (${t.reason})`),
    ...(prediction.unverifiedVeto.length > 0
      ? [
          '',
          `Assumes an unverified ${prediction.unverifiedVeto.join('/').toUpperCase()} veto (docs/rules.md).`,
        ]
      : []),
    '',
  ]
  writeFileSync(repoPath('data/events', context.eventId, 'status.md'), lines.join('\n'))
}
