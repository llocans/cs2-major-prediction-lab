/**
 * data/events/<id>/draw.json: each Swiss round's full draw as the stage page announced it, so the
 * site and simulate.ts use Valve's real pairings for the current round, not only the poller.
 */
import { existsSync } from 'node:fs'
import { type DrawRound, EventDraw, type Source } from '../../data/schemas/index.ts'
import type { Pairing } from '../../engine/swiss/types.ts'
import { readJson, repoPath, writeJson } from './files.ts'

const drawPath = (eventId: string) => repoPath('data/events', eventId, 'draw.json')

export function loadDraw(eventId: string): EventDraw {
  const path = drawPath(eventId)
  return existsSync(path) ? readJson(path, EventDraw) : { schemaVersion: 1, rounds: [] }
}

export function storedDraw(eventId: string, stageId: string, round: number): Pairing[] | undefined {
  return loadDraw(eventId).rounds.find((r) => r.stageId === stageId && r.round === round)?.pairings
}

const pairKey = (p: Pairing) => [p.teamA, p.teamB].sort().join('|')
const samePairs = (a: readonly Pairing[], b: readonly Pairing[]) => {
  const keys = new Set(a.map(pairKey))
  return a.length === b.length && b.every((p) => keys.has(pairKey(p)))
}

/**
 * Stores a round's full draw. "same" when that draw is stored already; a different one replaces it
 * (a corrected page), keeping the first `seenAt` only when the pairs are unchanged.
 */
export function saveDraw(
  eventId: string,
  stageId: string,
  round: number,
  pairings: readonly Pairing[],
  source: Source,
): 'saved' | 'same' {
  const draw = loadDraw(eventId)
  const existing = draw.rounds.find((r) => r.stageId === stageId && r.round === round)
  if (existing && samePairs(existing.pairings, pairings)) return 'same'
  const entry: DrawRound = {
    stageId,
    round,
    pairings: pairings.map(({ teamA, teamB }) => ({ teamA, teamB })),
    seenAt: new Date().toISOString(),
    source,
  }
  const rounds = [...draw.rounds.filter((r) => r !== existing), entry].sort(
    (a, b) => a.stageId.localeCompare(b.stageId) || a.round - b.round,
  )
  writeJson(drawPath(eventId), EventDraw, { schemaVersion: 1, rounds })
  return 'saved'
}
