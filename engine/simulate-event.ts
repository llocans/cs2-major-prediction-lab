import type { MatchFormat } from '../data/schemas/common.ts'
import { type PlayoffRules, roundCount } from './playoffs/bracket.ts'
import { playPlayoffsOnce } from './playoffs/simulate-playoffs.ts'
import { createRng } from './rng.ts'
import { seriesPlayer } from './series.ts'
import {
  playSwissRounds,
  type SwissSimInput,
  type SwissSimResult,
  simulateSwiss,
} from './simulate-swiss.ts'
import type { SwissFormat } from './swiss/format.ts'
import { pairRound } from './swiss/pairing.ts'
import { advancingTeams } from './swiss/standings.ts'
import type { SwissMatch, SwissRules } from './swiss/types.ts'

/** A Swiss stage after the current one. Its seeds are `invited` followed by the advancing teams. */
export interface ChainSwissStage {
  id: string
  rules: SwissRules
  format: SwissFormat
  /** Directly invited teams in seed order (seeds 1..n). */
  invited: readonly string[]
}

/** The rest of the event after the current Swiss stage. */
export interface EventChain {
  /** Swiss stages after the current one, in order. */
  next: readonly ChainSwissStage[]
  /** Playoffs after the last Swiss stage, seeded by its advancing teams in final seed order. */
  playoffs?: { rules: PlayoffRules }
}

export interface EventTeamOdds {
  teamId: string
  /** Reaches the playoffs (advances from the last Swiss stage). */
  pPlayoffs: number
  /** Wins the event; undefined when the chain has no playoffs. */
  pTitle?: number
}

export interface EventSimResult {
  /** The current stage, exactly as simulateSwiss reports it for the same input. */
  stage: SwissSimResult
  /** Every team in the current stage and the later stages. */
  teams: EventTeamOdds[]
  /** Standard error of the least certain event probability. */
  maxStandardError: number
  /** Match formats used after the current stage whose veto procedure is not yet verified. */
  unverifiedVeto: MatchFormat[]
}

/** The later stages draw from their own stream, so chaining never changes the current stage's odds. */
const CHAIN_SEED_SALT = 0x5bd1e995

/**
 * Monte Carlo of the rest of the event from the current Swiss stage: each run plays the current
 * stage (as simulateSwiss), seeds the next stages with the advancing teams, plays them from round 1,
 * then the playoffs. Deterministic for a given input and seed.
 */
export function simulateEvent(
  input: SwissSimInput,
  chain: EventChain,
  hooks: {
    /** Called with each stage's seeds in every run (stage id, or "playoffs"). For tests. */
    observe?: (stageId: string, seeds: readonly string[]) => void
    /** Called with the current stage's full matches in every run (as simulateSwiss's onRun). */
    onStageRun?: (matches: readonly SwissMatch[]) => void
  } = {},
): EventSimResult {
  const { observe, onStageRun } = hooks
  const { model, veto, runs } = input
  const rng = createRng((input.seed ^ CHAIN_SEED_SALT) >>> 0)
  const play = seriesPlayer(model, veto, rng)

  const teamIds = [...input.seeds, ...chain.next.flatMap((stage) => stage.invited)]
  if (new Set(teamIds).size !== teamIds.length) {
    throw new Error('A team appears in more than one stage of the event chain')
  }
  const counts = new Map(teamIds.map((id) => [id, { playoffs: 0, title: 0 }]))
  const finalRound = chain.playoffs ? roundCount(chain.playoffs.rules) : 0

  const stage = simulateSwiss(input, (matches) => {
    onStageRun?.(matches)
    let advancing = advancingTeams(input.seeds, matches, input.rules)
    for (const next of chain.next) {
      const seeds = [...next.invited, ...advancing]
      observe?.(next.id, seeds)
      const played = playSwissRounds({
        seeds,
        rules: next.rules,
        format: next.format,
        played: [],
        fromRound: 1,
        pairings: (round, so) => pairRound(round, seeds, so, next.rules),
        play,
      })
      advancing = advancingTeams(seeds, played, next.rules)
    }
    for (const team of advancing) {
      const count = counts.get(team)
      if (count) count.playoffs++
    }
    if (!chain.playoffs) return
    observe?.('playoffs', advancing)
    const bracket = playPlayoffsOnce(advancing, chain.playoffs.rules, new Map(), play)
    const final = bracket.find((m) => !m.thirdPlace && m.round === finalRound)
    const champion = final?.winner === undefined ? undefined : counts.get(final.winner)
    if (champion) champion.title++
  })

  const teams: EventTeamOdds[] = teamIds.map((teamId) => {
    const count = counts.get(teamId)
    if (!count) throw new Error(`Missing counts for ${teamId}`)
    return {
      teamId,
      pPlayoffs: count.playoffs / runs,
      ...(chain.playoffs ? { pTitle: count.title / runs } : {}),
    }
  })
  const probabilities = teams.flatMap((t) => [t.pPlayoffs, t.pTitle ?? 0])
  const maxStandardError = Math.max(0, ...probabilities.map((p) => Math.sqrt((p * (1 - p)) / runs)))

  const formats = new Set<MatchFormat>()
  for (const next of chain.next) {
    formats.add(next.format.default)
    formats.add(next.format.decider)
  }
  if (chain.playoffs) {
    const { format, thirdPlaceDecider } = chain.playoffs.rules
    formats.add(format.default)
    formats.add(format.final)
    if (thirdPlaceDecider && format.thirdPlace) formats.add(format.thirdPlace)
  }
  const unverifiedVeto = [...formats].filter((f) => veto[f]?.unverified === true).sort()

  return { stage, teams, maxStandardError, unverifiedVeto }
}
