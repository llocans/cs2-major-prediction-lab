/**
 * Pick'Em, as in the CS2 in-game Major Pick'Em. Swiss stages: a few teams that finish 3-0, a few that
 * advance 3-1 or 3-2, a few that finish 0-3 (counts from the event config). The boxes do not
 * overlap: a team picked to advance that goes 3-0 is a wrong pick. Playoffs: the winner of every
 * bracket match. Pure: scoring, the model's own picks and the chance that picks pass.
 */
import type { BracketMatch } from './playoffs/bracket.ts'
import { buildRecords } from './swiss/records.ts'
import type { SwissMatch, SwissRules, TeamRecord } from './swiss/types.ts'

export type SwissBox = 'threeZero' | 'advance' | 'zeroThree'
export const SWISS_BOXES: readonly SwissBox[] = ['threeZero', 'advance', 'zeroThree']

export type SwissPicks = Record<SwissBox, string[]>
export type PickStatus = 'correct' | 'wrong' | 'pending'

/** How many teams go in each box, and how many correct picks pass the stage. */
export interface SwissPickemRules {
  threeZero: number
  advance: number
  zeroThree: number
  toPass: number
}

export const emptySwissPicks = (): SwissPicks => ({ threeZero: [], advance: [], zeroThree: [] })

/**
 * Picks cleaned for a stage: only its teams, each team once, at most the box size. Stored picks are
 * read back from the browser and may be from another draw or hand-edited.
 */
export function cleanSwissPicks(
  picks: SwissPicks,
  teams: readonly string[],
  rules: SwissPickemRules,
): SwissPicks {
  const allowed = new Set(teams)
  const seen = new Set<string>()
  const clean = emptySwissPicks()
  for (const box of SWISS_BOXES) {
    for (const team of picks[box]) {
      if (!allowed.has(team) || seen.has(team) || clean[box].length >= rules[box]) continue
      seen.add(team)
      clean[box].push(team)
    }
  }
  return clean
}

/** Final outcome of a team in a finished stage, the way Pick'Em sees it. */
export const Outcome = { ThreeZero: 0, Advance: 1, Out: 2, ZeroThree: 3 } as const
export type Outcome = (typeof Outcome)[keyof typeof Outcome]

/** Outcome of a finished record, or undefined while the team still plays. */
export function finalOutcome(
  record: Pick<TeamRecord, 'wins' | 'losses'>,
  rules: SwissRules,
): Outcome | undefined {
  if (record.wins >= rules.winsToAdvance) {
    return record.losses === 0 ? Outcome.ThreeZero : Outcome.Advance
  }
  if (record.losses >= rules.lossesToEliminate) {
    return record.wins === 0 ? Outcome.ZeroThree : Outcome.Out
  }
  return undefined
}

const boxOutcome: Record<SwissBox, Outcome> = {
  threeZero: Outcome.ThreeZero,
  advance: Outcome.Advance,
  zeroThree: Outcome.ZeroThree,
}

/** A pick is settled as soon as the record rules it in or out, before the team's stage ends. */
export function swissPickStatus(
  box: SwissBox,
  record: Pick<TeamRecord, 'wins' | 'losses'>,
  rules: SwissRules,
): PickStatus {
  const outcome = finalOutcome(record, rules)
  if (outcome !== undefined) return outcome === boxOutcome[box] ? 'correct' : 'wrong'
  if (box === 'threeZero' && record.losses > 0) return 'wrong'
  if (box === 'zeroThree' && record.wins > 0) return 'wrong'
  // An advance pick at 2-0 is still open: 3-0 makes it wrong, a loss then a win makes it right.
  return 'pending'
}

export interface PickScore {
  correct: number
  wrong: number
  pending: number
}

export function tally(statuses: Iterable<PickStatus>): PickScore {
  const score: PickScore = { correct: 0, wrong: 0, pending: 0 }
  for (const status of statuses) score[status]++
  return score
}

/** Status of every pick, keyed by team id. */
export function scoreSwissPicks(
  picks: SwissPicks,
  records: ReadonlyMap<string, Pick<TeamRecord, 'wins' | 'losses'>>,
  rules: SwissRules,
): Map<string, PickStatus> {
  const statuses = new Map<string, PickStatus>()
  for (const box of SWISS_BOXES) {
    for (const team of picks[box]) {
      const record = records.get(team) ?? { wins: 0, losses: 0 }
      statuses.set(team, swissPickStatus(box, record, rules))
    }
  }
  return statuses
}

/** Teams' outcomes in simulated runs: `codes[run * teams.length + i]` is team i's Outcome. */
export interface SwissOutcomes {
  teams: readonly string[]
  runs: number
  codes: Uint8Array
}

/** Collects every run's outcomes (pass `add` as the stage simulation's per-run callback). */
export function outcomeCollector(seeds: readonly string[], rules: SwissRules, runs: number) {
  const codes = new Uint8Array(runs * seeds.length)
  let run = 0
  return {
    add(matches: readonly SwissMatch[]) {
      if (run >= runs) return
      const final = buildRecords(seeds, matches)
      seeds.forEach((team, i) => {
        const record = final.get(team)
        codes[run * seeds.length + i] = record
          ? (finalOutcome(record, rules) ?? Outcome.Out)
          : Outcome.Out
      })
      run++
    },
    result: (): SwissOutcomes => ({ teams: seeds, runs: run, codes }),
  }
}

export interface PickChance {
  /** Probability of at least `toPass` correct picks. */
  pPass: number
  /** Expected number of correct picks. */
  expected: number
}

/** Chance that a set of picks passes, counted over the simulated runs. */
export function swissPickChance(
  picks: SwissPicks,
  outcomes: SwissOutcomes,
  toPass: number,
): PickChance {
  const index = new Map(outcomes.teams.map((team, i) => [team, i]))
  const wanted: Array<[number, Outcome]> = SWISS_BOXES.flatMap((box) =>
    picks[box].flatMap((team) => {
      const i = index.get(team)
      return i === undefined ? [] : [[i, boxOutcome[box]] as [number, Outcome]]
    }),
  )
  if (outcomes.runs === 0) return { pPass: 0, expected: 0 }
  const n = outcomes.teams.length
  let passed = 0
  let total = 0
  for (let run = 0; run < outcomes.runs; run++) {
    let correct = 0
    for (const [i, outcome] of wanted) if (outcomes.codes[run * n + i] === outcome) correct++
    total += correct
    if (correct >= toPass) passed++
  }
  return { pPass: passed / outcomes.runs, expected: total / outcomes.runs }
}

/** A team's chance of each Pick'Em outcome (advance means 3-1 or 3-2 here). */
export interface SwissPickOdds {
  teamId: string
  p30: number
  pAdvance: number
  p03: number
}

const boxChance = (odds: SwissPickOdds, box: SwissBox) =>
  box === 'threeZero' ? odds.p30 : box === 'zeroThree' ? odds.p03 : odds.pAdvance - odds.p30

/** Probability that a team ends up in a box (advance: 3-1 or 3-2, not 3-0). */
export function chanceOfBox(odds: SwissPickOdds, box: SwissBox): number {
  return Math.max(0, boxChance(odds, box))
}

/**
 * The model's picks, aiming at the most correct picks on average. Fills each box greedily, then
 * swaps pairs of teams between boxes (and with unpicked teams) while that adds expected correct
 * picks. A heuristic: it can miss gains that need three teams to move at once.
 */
export function modelSwissPicks(
  teams: readonly SwissPickOdds[],
  rules: SwissPickemRules,
): SwissPicks {
  const byId = new Map(teams.map((t) => [t.teamId, t]))
  const value = (team: string, box: SwissBox) => {
    const odds = byId.get(team)
    return odds ? chanceOfBox(odds, box) : 0
  }
  const picks = emptySwissPicks()
  const used = new Set<string>()
  for (const box of ['threeZero', 'zeroThree', 'advance'] as const) {
    const ranked = teams
      .map((t) => t.teamId)
      .filter((id) => !used.has(id))
      .sort((a, b) => value(b, box) - value(a, box) || (a < b ? -1 : a > b ? 1 : 0))
    picks[box] = ranked.slice(0, rules[box])
    for (const id of picks[box]) used.add(id)
  }

  // Local search: move a picked team to another box's slot or swap it with any other team.
  for (let pass = 0; pass < 50; pass++) {
    let improved = false
    for (const boxA of SWISS_BOXES) {
      for (let i = 0; i < picks[boxA].length; i++) {
        const a = picks[boxA][i]
        if (a === undefined) continue
        for (const other of teams) {
          const b = other.teamId
          if (b === a) continue
          const boxB = SWISS_BOXES.find((box) => picks[box].includes(b))
          const before = value(a, boxA) + (boxB ? value(b, boxB) : 0)
          const after = value(b, boxA) + (boxB ? value(a, boxB) : 0)
          if (after <= before + 1e-12) continue
          picks[boxA][i] = b
          if (boxB) picks[boxB][picks[boxB].indexOf(b)] = a
          improved = true
          break
        }
      }
    }
    if (!improved) break
  }
  return picks
}

/** Playoff picks: the picked winner of each bracket match, keyed by `slotKey`. */
export type PlayoffPicks = Record<string, string>

export const slotKey = (round: number, index: number) => `${round}-${index}`

/** The bracket's matches that take a pick (not the third-place match), in round order. */
export const pickSlots = (bracket: readonly BracketMatch[]) => bracket.filter((m) => !m.thirdPlace)

/**
 * Teams that can be picked in a slot: the two teams of a first-round match, later the picked winners
 * of the two feeding matches (as in-game: a pick builds on your earlier picks).
 */
export function slotCandidates(
  round: number,
  index: number,
  firstRound: readonly BracketMatch[],
  picks: PlayoffPicks,
): string[] {
  if (round === 1) {
    const match = firstRound.find((m) => m.index === index)
    return match?.teamA && match.teamB ? [match.teamA, match.teamB] : []
  }
  return [picks[slotKey(round - 1, index * 2)], picks[slotKey(round - 1, index * 2 + 1)]].filter(
    (team): team is string => team !== undefined,
  )
}

/** Drops picks that no longer follow from the earlier picks (after an earlier pick changed). */
export function prunePlayoffPicks(
  picks: PlayoffPicks,
  firstRound: readonly BracketMatch[],
  rounds: number,
): PlayoffPicks {
  const kept: PlayoffPicks = {}
  for (let round = 1; round <= rounds; round++) {
    const matches = 2 ** (rounds - round)
    for (let index = 0; index < matches; index++) {
      const key = slotKey(round, index)
      const pick = picks[key]
      if (pick && slotCandidates(round, index, firstRound, kept).includes(pick)) kept[key] = pick
    }
  }
  return kept
}

/**
 * Status of each playoff pick against the bracket so far (real results only). A pick is wrong as
 * soon as its team is out, before its own match is played.
 */
export function scorePlayoffPicks(
  picks: PlayoffPicks,
  bracket: readonly BracketMatch[],
): Map<string, PickStatus> {
  const out = new Set(
    bracket
      .filter((m) => !m.thirdPlace && m.winner !== undefined)
      .map((m) => (m.winner === m.teamA ? m.teamB : m.teamA)),
  )
  const statuses = new Map<string, PickStatus>()
  for (const match of pickSlots(bracket)) {
    const key = slotKey(match.round, match.index)
    const pick = picks[key]
    if (!pick) continue
    if (match.winner !== undefined) statuses.set(key, match.winner === pick ? 'correct' : 'wrong')
    else statuses.set(key, out.has(pick) ? 'wrong' : 'pending')
  }
  return statuses
}

/** A team's chance to win a match of each round: reach the semifinal, the final, win the title. */
export interface PlayoffPickOdds {
  teamId: string
  pSemifinal: number
  pFinal: number
  pTitle: number
}

/**
 * Chance that a team wins its match in `round` (of `rounds`), from the simulated playoff odds.
 * Undefined for rounds before the quarterfinals, which the playoff odds do not cover.
 */
export function playoffRoundChance(
  odds: PlayoffPickOdds,
  round: number,
  rounds: number,
): number | undefined {
  const fromEnd = rounds - round
  if (fromEnd === 0) return odds.pTitle
  if (fromEnd === 1) return odds.pFinal
  if (fromEnd === 2) return odds.pSemifinal
  return undefined
}

/**
 * The model's playoff picks: in every match, the candidate more likely to win that round (building
 * on its earlier picks). Simple and close to the best expected total, not guaranteed to be it.
 */
export function modelPlayoffPicks(
  firstRound: readonly BracketMatch[],
  rounds: number,
  odds: readonly PlayoffPickOdds[],
): PlayoffPicks {
  const byId = new Map(odds.map((o) => [o.teamId, o]))
  const chance = (team: string, round: number) => {
    const o = byId.get(team)
    return (o && playoffRoundChance(o, round, rounds)) ?? 0
  }
  const picks: PlayoffPicks = {}
  for (let round = 1; round <= rounds; round++) {
    for (let index = 0; index < 2 ** (rounds - round); index++) {
      const [best] = slotCandidates(round, index, firstRound, picks).sort(
        (a, b) => chance(b, round) - chance(a, round),
      )
      if (best) picks[slotKey(round, index)] = best
    }
  }
  return picks
}
