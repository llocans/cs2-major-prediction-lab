/**
 * Builds one batch of bet slips for a round from its value picks and freezes it in
 * `data/events/<id>/slips.json` (never edited later, like snapshots). Run by `log-odds.ts` after every
 * odds reading; each run is a batch: the pool is the round's value picks read before their kickoff,
 * not started and not already in a slip (`engine/bet-slips.ts`). Uses the bookmaker's own decimal
 * odds from the git-ignored local file when every pick has them, else margin-free odds.
 * Usage:
 *   node scripts/build-slips.ts <event> <stage> <round>
 *   node scripts/build-slips.ts <event> <stage> --replay   (every round, margin-free, prints only)
 */
import { existsSync, globSync } from 'node:fs'
import {
  BookmakerOdds,
  EventConfig,
  EventResults,
  EventSlips,
  LocalMarketOdds,
  Snapshot,
} from '../data/schemas/index.ts'
import {
  buildSlips,
  type PoolOdds,
  type SlipRule,
  slipOutcome,
  slipPool,
  winnersByPair,
} from '../engine/bet-slips.ts'
import { stageMarketPicks } from '../engine/market-picks.ts'
import { readJson, repoPath, repoRoot, writeJson } from './lib/files.ts'

const [eventId, stageId, roundArg] = process.argv.slice(2)
if (!eventId || !stageId || !roundArg) {
  console.error('Usage: node scripts/build-slips.ts <event> <stage> <round|--replay>')
  process.exit(1)
}
const replay = roundArg === '--replay'

const dir = (...parts: string[]) => repoPath('data/events', eventId, ...parts)
const config = readJson(dir('config.json'), EventConfig)
const stage = config.stages.find((s) => s.id === stageId)
if (!stage?.marketRule) throw new Error(`${eventId}: stage "${stageId}" has no marketRule`)
// A replay checks the builder on a stage without slips (Stage 1) with the usual numbers.
const rule: SlipRule | undefined =
  stage.marketRule.slips ?? (replay ? { maxLegs: 4, safeMinChance: 0.5 } : undefined)
if (!rule) {
  console.log(`${stageId}: no slips rule in marketRule, nothing to build`)
  process.exit(0)
}

const snapshots = globSync(`data/events/${eventId}/snapshots/*.json`, { cwd: repoRoot }).map((p) =>
  readJson(repoPath(p), Snapshot),
)
const odds = readJson(dir('bookmaker-odds.json'), BookmakerOdds).entries
const results = readJson(dir('results.json'), EventResults).matches
const localPath = dir('local', 'market-odds.json')
const local = existsSync(localPath) ? readJson(localPath, LocalMarketOdds).entries : []
const record = stageMarketPicks(stageId, stage.marketRule, snapshots, odds, results)
const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** The odds for the pool: the bookmaker's own where saved locally, else margin-free. */
function poolOdds(round: number, useReal: boolean): PoolOdds[] {
  return odds
    .filter((o) => o.stageId === stageId && o.round === round)
    .map((o) => {
      const real = useReal
        ? local.find(
            (l) =>
              l.stageId === stageId &&
              l.round === round &&
              pair(l.teamA, l.teamB) === pair(o.teamA, o.teamB),
          )
        : undefined
      const [oddsA, oddsB] = real
        ? real.teamA === o.teamA
          ? [real.oddsA, real.oddsB]
          : [real.oddsB, real.oddsA]
        : [1 / o.pA, 1 / (1 - o.pA)]
      return {
        teamA: o.teamA,
        teamB: o.teamB,
        oddsA,
        oddsB,
        // A replay looks at the round as it stood before it was played.
        observedAt: o.observedAt ?? `${o.source.retrievedAt}T00:00:00Z`,
        // A replay has no kickoffs before Stage 2; the round's start stands in for them.
        startsAt: replay ? '9999-12-31T00:00:00Z' : o.startsAt,
      }
    })
}

const names = (legs: ReadonlyArray<{ pick: string; chance: number }>) =>
  legs.map((l) => `${l.pick} ${(l.chance * 100).toFixed(0)}%`).join(', ')

if (replay) {
  for (const round of record.rounds) {
    // Before the round: no results, nothing slipped yet.
    const matches = round.matches.map(({ result: _r, pickWon: _w, units: _u, ...m }) => m)
    const pool = slipPool(matches, poolOdds(round.round, false), [], '1970-01-01T00:00:00Z')
    const built = buildSlips(pool, rule)
    console.log(`R${round.round}: ${built.slips.length === 0 ? 'no slip' : ''}`)
    const winners = winnersByPair(results, stageId, round.round)
    const legOdds = new Map(pool.map((c) => [c.pick, c.odds]))
    for (const slip of built.slips) {
      const out = slipOutcome(slip, winners, (l) => legOdds.get(l.pick))
      const units =
        out.units === undefined ? '' : ` ${out.units >= 0 ? '+' : ''}${out.units.toFixed(2)} u`
      console.log(`  ${slip.kind}: ${names(slip.legs)} -> ${out.status}${units}`)
    }
  }
  process.exit(0)
}

const round = Number(roundArg)
const slipsPath = dir('slips.json')
const file = existsSync(slipsPath)
  ? readJson(slipsPath, EventSlips)
  : { schemaVersion: 1 as const, eventId, batches: [] }
const earlier = file.batches.filter((b) => b.stageId === stageId && b.round === round)
const matches = record.rounds.find((r) => r.round === round)?.matches ?? []
const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
const realPool = slipPool(
  matches,
  poolOdds(round, true),
  earlier.flatMap((b) => b.slips.flatMap((s) => s.legs)),
  now,
)
const marginFreePool = slipPool(
  matches,
  poolOdds(round, false),
  earlier.flatMap((b) => b.slips.flatMap((s) => s.legs)),
  now,
)
// Real odds only when every pick in the pool has them; one value check for the whole batch.
const hasReal = (c: { teamA: string; teamB: string }) =>
  local.some(
    (l) =>
      l.stageId === stageId &&
      l.round === round &&
      pair(l.teamA, l.teamB) === pair(c.teamA, c.teamB),
  )
const useReal = marginFreePool.length > 0 && marginFreePool.every(hasReal)
const pool = useReal ? realPool : marginFreePool
if (pool.length === 0 && earlier.length > 0) {
  console.log(`${stageId} round ${round}: no value picks left for a slip`)
  process.exit(0)
}
const built = buildSlips(pool, rule)
// Every batch with a slip is kept; a batch without one only as the round's first, so the page can
// say why there is no slip, and re-running never adds the same empty batch again.
if (built.slips.length === 0 && earlier.length > 0) {
  console.log(`${stageId} round ${round}: no new slip`)
  process.exit(0)
}
writeJson(slipsPath, EventSlips, {
  ...file,
  batches: [
    ...file.batches,
    {
      stageId,
      round,
      builtAt: now,
      odds: useReal ? 'real' : 'margin-free',
      slips: built.slips,
      left: built.left,
    },
  ],
})
console.log(`${stageId} round ${round}: batch at ${now} (${useReal ? 'real' : 'margin-free'} odds)`)
for (const slip of built.slips) console.log(`  ${slip.kind}: ${names(slip.legs)}`)
for (const leg of built.left) console.log(`  left out (${leg.reason}): ${leg.pick}`)
if (built.slips.length === 0) console.log('  no slip this round')
