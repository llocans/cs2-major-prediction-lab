/**
 * Replays a stage's saved rounds with one or more model versions and scores them on the real
 * results. Each round starts from what the model knew before it: the ratings of the saved snapshot
 * (data/ratings/history/), the results of earlier rounds, the modifiers that existed that day and
 * the round's real draw. Writes nothing.
 *
 * Usage: node scripts/replay-stage.ts <event-id> <stage-id> [version ...]
 * (default: the stage's own version). Replaying the version a snapshot was made with gives its
 * numbers back: match odds within about 1 pp for snapshots made before 2026-11-25 (their match
 * odds were counted from the runs), team odds within the sampling noise.
 */
import { existsSync, globSync } from 'node:fs'
import type { MapId } from '../data/schemas/common.ts'
import {
  EventConfig,
  EventResults,
  EventTeams,
  Modifiers,
  Ratings,
  Snapshot,
  type SwissStage,
} from '../data/schemas/index.ts'
import { buildMatchModel } from '../engine/match-model.ts'
import { predictStage } from '../engine/predict.ts'
import { mapSlotChances } from '../engine/series.ts'
import { stageSeeds } from '../engine/swiss/stage-seeds.ts'
import { readJson, repoPath } from './lib/files.ts'
import { loadParams, loadStageVersions } from './lib/model-versions.ts'

const [eventId, stageId, ...requested] = process.argv.slice(2)
if (!eventId || !stageId) {
  console.error('Usage: node scripts/replay-stage.ts <event-id> <stage-id> [version ...]')
  process.exit(1)
}

const dir = repoPath('data/events', eventId)
const config = readJson(`${dir}/config.json`, EventConfig)
const stage = config.stages.find((s) => s.id === stageId)
if (stage?.type !== 'swiss') throw new Error(`${eventId}: no Swiss stage "${stageId}"`)
const swiss: SwissStage = stage
const teams = readJson(`${dir}/teams.json`, EventTeams)
const results = readJson(`${dir}/results.json`, EventResults).matches.filter(
  (m) => m.stageId === stageId,
)
const modifiersPath = repoPath('data/model/modifiers.json')
const modifiers = existsSync(modifiersPath) ? readJson(modifiersPath, Modifiers).modifiers : []
const versions =
  requested.length > 0 ? requested : [loadStageVersions(config, stageId).main.version]
const snapshots = globSync(`data/events/${eventId}/snapshots/${stageId}-r*.json`, {
  cwd: repoPath(),
})
  .map((file) => readJson(repoPath(file), Snapshot))
  .sort((a, b) => a.beforeRound - b.beforeRound)
const seeds = stageSeeds(teams.participants, stageId)
const names = new Map(teams.participants.map((p) => [p.teamId, p.displayName]))
const labels = {
  team: (id: string) => names.get(id) ?? id,
  map: (id: string) => config.mapPool.find((m) => m.id === id)?.name ?? id,
}
const pairKey = (a: string, b: string) => [a, b].sort().join('|')

interface Score {
  matches: number
  hits: number
  brier: number
  /** Sum over matches of the mean chance given to the maps actually played, slot by slot. */
  mapChance: number
  bo1: number
  bo1TopRight: number
  maxMatchDiff: number
  maxTeamDiff: number
}
const empty = (): Score => ({
  matches: 0,
  hits: 0,
  brier: 0,
  mapChance: 0,
  bo1: 0,
  bo1TopRight: 0,
  maxMatchDiff: 0,
  maxTeamDiff: 0,
})
const saved = empty()
const replayed = new Map(versions.map((v) => [v, empty()]))

for (const snapshot of snapshots) {
  const round = snapshot.beforeRound
  const stamp = snapshot.ratingsAsOf.replaceAll(/[:.]/g, '-')
  const ratingsFile = repoPath('data/ratings/history', `${stamp}.json`)
  if (!existsSync(ratingsFile)) throw new Error(`R${round}: no ratings history file ${stamp}.json`)
  const ratings = readJson(ratingsFile, Ratings)
  const day = snapshot.createdAt.slice(0, 10)
  const known = modifiers.filter((m) => m.createdAt <= day)
  const played = results
    .filter((m) => m.round < round)
    .map((m) => ({ round: m.round, teamA: m.teamA, teamB: m.teamB, winner: m.winner }))
  const real = results.filter((m) => m.round === round)
  const announced = snapshot.matches.map((m) => ({ teamA: m.teamA, teamB: m.teamB }))

  for (const match of snapshot.matches) {
    const result = real.find((r) => pairKey(r.teamA, r.teamB) === pairKey(match.teamA, match.teamB))
    if (result) add(saved, match.pA, result.winner === match.teamA)
  }

  for (const version of versions) {
    const params = loadParams(version)
    const model = buildMatchModel(
      ratings,
      known,
      params,
      config.mapPool.map((m) => m.id),
      day,
    )
    const input = {
      seeds,
      rules: {
        winsToAdvance: swiss.winsToAdvance,
        lossesToEliminate: swiss.lossesToEliminate,
        initialPairing: swiss.initialPairing,
      },
      format: swiss.format,
      veto: config.veto,
      model,
      played,
      announced,
      runs: params.sim.runs,
      seed: params.sim.seed,
    }
    const prediction = predictStage(input, labels)
    const score = replayed.get(version) ?? empty()
    for (const team of prediction.teams) {
      const before = snapshot.teams.find((t) => t.teamId === team.teamId)
      if (before) {
        score.maxTeamDiff = Math.max(score.maxTeamDiff, Math.abs(team.pAdvance - before.pAdvance))
      }
    }
    for (const match of prediction.matches) {
      const before = snapshot.matches.find(
        (m) => pairKey(m.teamA, m.teamB) === pairKey(match.teamA, match.teamB),
      )
      if (before) score.maxMatchDiff = Math.max(score.maxMatchDiff, Math.abs(match.pA - before.pA))
      const result = real.find(
        (r) => pairKey(r.teamA, r.teamB) === pairKey(match.teamA, match.teamB),
      )
      if (!result) continue
      add(score, match.pA, result.winner === match.teamA)
      const slots = mapSlotChances(match.teamA, match.teamB, match.format, model, config.veto)
      const playedMaps: MapId[] = result.maps.map((m) => m.map)
      const chances = playedMaps.map((map, slot) => slots[slot]?.get(map) ?? 0)
      score.mapChance += chances.reduce((sum, p) => sum + p, 0) / chances.length
      if (match.format === 'bo1') {
        score.bo1 += 1
        const first = slots[0] ?? new Map<MapId, number>()
        const top = [...first.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        if (top === playedMaps[0]) score.bo1TopRight += 1
      }
    }
  }
}

function add(score: Score, pA: number, aWon: boolean) {
  score.matches += 1
  score.brier += (pA - (aWon ? 1 : 0)) ** 2
  if (pA !== 0.5 && pA > 0.5 === aWon) score.hits += 1
}

const rounds = snapshots.map((s) => s.beforeRound).join(', ')
console.log(`${config.name} · ${swiss.name} · replay of rounds ${rounds}\n`)
const line = (label: string, s: Score, extra: string) =>
  console.log(
    `${label.padEnd(22)}${String(s.matches).padStart(4)}  ${(s.brier / s.matches).toFixed(3)}  ${`${s.hits}/${s.matches}`.padStart(6)}${extra}`,
  )
console.log(`${'Model'.padEnd(22)}  n  Brier    hits  map chance  Bo1 top map  max diff vs saved`)
line(`saved (${[...new Set(snapshots.map((s) => s.modelVersion))].join(', ')})`, saved, '')
for (const [version, s] of replayed) {
  const map = `${((s.mapChance / s.matches) * 100).toFixed(1).padStart(9)}%`
  const top = `${`${s.bo1TopRight}/${s.bo1}`.padStart(12)}`
  const diff = `  match ${(s.maxMatchDiff * 100).toFixed(1)} pp, advance ${(s.maxTeamDiff * 100).toFixed(1)} pp`
  line(`replay ${version}`, s, `  ${map}  ${top}${diff}`)
}
console.log(
  '\nBrier: lower is better (always 50% scores 0.250). Map chance: the mean chance the veto gave the' +
    ' maps actually played (random: 14%). Max diff: the largest change from the saved snapshot.',
)
