import { type ReactNode, useId } from 'react'
import type { BracketMatch, BracketRound } from '../../../engine/swiss/bracket.ts'
import { pct } from '../lib/format.ts'
import type { Pick } from '../lib/verdict.ts'
import {
  bracketSize,
  bracketSlots,
  type GroupSlot,
  LAYOUT,
  type ResultSlot,
  resultColumns,
  type Slot,
} from './bracket-layout.ts'
import { TeamLogo } from './TeamLogo.tsx'

interface Props {
  rounds: BracketRound[]
  /** Probability that teamA wins, for pending matches, keyed "a|b". */
  pending: Map<string, number>
  scores: Map<string, string>
  /** The model's saved pick for finished matches, keyed "round|a|b". */
  picks: Map<string, Pick>
  selected?: string
  name: (teamId: string) => string
  /** Short name (e.g. "NIP") for the result boxes. */
  short: (teamId: string) => string
  winsToAdvance: number
  lossesToEliminate: number
  /** The market's chance that `team` beats `opponent` in a round, if logged (shown on hover). */
  market?: (round: number, team: string, opponent: string) => number | undefined
  onPick: (match: BracketMatch, winner: string) => void
  onSelect: (teamId: string) => void
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function SwissBracket(props: Props) {
  const { rounds, pending, scores, picks, selected, name, short, market, onPick, onSelect } = props
  const slots = bracketSlots(16, rounds.length, props.winsToAdvance, props.lossesToEliminate)
  const { width, height } = bracketSize(slots)
  const finals = finalRecords(rounds, props.winsToAdvance, props.lossesToEliminate)

  return (
    <section className="overflow-x-auto pb-2" aria-label="Swiss bracket" data-scrolls>
      <div className="relative" style={{ width, height }}>
        <Connectors slots={slots} rounds={rounds} />
        {rounds.map((round) => (
          <div
            key={round.round}
            className="absolute font-display text-xs font-semibold uppercase tracking-wider text-ink-3"
            style={{ left: (round.round - 1) * (LAYOUT.columnWidth + LAYOUT.columnGap), top: 0 }}
          >
            Round {round.round}
          </div>
        ))}
        {slots.map((slot) =>
          slot.kind === 'result' ? (
            <ResultBox
              key={`${slot.round}-${slot.outcome}`}
              slot={slot}
              finals={finals}
              selected={selected}
              name={name}
              short={short}
              onSelect={onSelect}
            />
          ) : (
            <Group
              key={`${slot.round}-${slot.wins}-${slot.losses}`}
              slot={slot}
              rounds={rounds}
              lossesToEliminate={props.lossesToEliminate}
              winsToAdvance={props.winsToAdvance}
              render={(match) => (
                <MatchRow
                  key={pairKey(match.teamA, match.teamB)}
                  match={match}
                  pA={pending.get(pairKey(match.teamA, match.teamB))}
                  score={scores.get(`${match.round}|${pairKey(match.teamA, match.teamB)}`)}
                  pick={picks.get(`${match.round}|${pairKey(match.teamA, match.teamB)}`)}
                  selected={selected}
                  name={name}
                  market={market}
                  onPick={onPick}
                  onSelect={onSelect}
                />
              )}
            />
          ),
        )}
      </div>
    </section>
  )
}

function Group(props: {
  slot: GroupSlot
  rounds: BracketRound[]
  winsToAdvance: number
  lossesToEliminate: number
  render: (match: BracketMatch) => ReactNode
}) {
  const { slot, rounds, winsToAdvance, lossesToEliminate, render } = props
  const record = `${slot.wins}-${slot.losses}`
  const group = rounds.find((r) => r.round === slot.round)?.groups.find((g) => g.record === record)
  const forPlayoffs = slot.wins === winsToAdvance - 1
  const elimination = slot.losses === lossesToEliminate - 1
  const tag =
    forPlayoffs && elimination
      ? 'decider'
      : forPlayoffs
        ? 'to advance'
        : elimination
          ? 'elimination'
          : ''
  return (
    <section
      className="absolute"
      style={{ left: slot.x, top: slot.y, width: LAYOUT.columnWidth, height: slot.height }}
    >
      <header
        className="flex items-baseline justify-between font-display text-base font-semibold text-ink-2"
        style={{ height: LAYOUT.headerHeight }}
      >
        <span className="num">{record}</span>
        <span className="text-xs uppercase tracking-wider text-ink-3">{tag}</span>
      </header>
      <div className="flex flex-col" style={{ gap: LAYOUT.matchGap }}>
        {group
          ? group.matches.map(render)
          : Array.from({ length: slot.size / 2 }, (_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
                key={i}
                className="rounded-md border border-dashed border-rule"
                style={{ height: LAYOUT.matchHeight }}
              />
            ))}
      </div>
    </section>
  )
}

function MatchRow(props: {
  match: BracketMatch
  pA: number | undefined
  score: string | undefined
  pick: Pick | undefined
  selected: string | undefined
  name: (teamId: string) => string
  market?: (round: number, team: string, opponent: string) => number | undefined
  onPick: (match: BracketMatch, winner: string) => void
  onSelect: (teamId: string) => void
}) {
  const { match, pA, score, pick, selected, name, market, onPick, onSelect } = props
  const sides = [
    { team: match.teamA, p: pA },
    { team: match.teamB, p: pA === undefined ? undefined : 1 - pA },
  ]
  const [scoreA, scoreB] = (score ?? '').split('-')
  const done = match.kind !== 'pending'

  return (
    <div
      className="grid overflow-hidden rounded-md border border-rule bg-paper-2"
      style={{ height: LAYOUT.matchHeight, gridTemplateRows: '1fr 1fr' }}
    >
      {sides.map(({ team, p }, index) => {
        const won = match.winner === team
        const lost = done && !won
        const isSelected = selected === team
        const opponent = team === match.teamA ? match.teamB : match.teamA
        const pMarket = market?.(match.round, team, opponent)
        const marketNote = pMarket === undefined ? '' : ` · market ${pct(pMarket)}`
        return (
          <div
            key={team}
            className={[
              'flex items-center gap-1.5 px-2 text-sm leading-none',
              index === 0 ? 'border-b border-rule' : '',
              won && match.kind === 'override' ? 'bg-accent-soft' : '',
            ].join(' ')}
          >
            <TeamLogo teamId={team} />
            <button
              type="button"
              className={[
                'min-w-0 flex-1 self-stretch truncate text-left',
                won ? 'font-semibold text-ink' : lost ? 'text-ink-3' : 'text-ink',
                isSelected ? 'underline decoration-accent decoration-2 underline-offset-2' : '',
              ].join(' ')}
              onClick={() => onSelect(team)}
              title={`Show ${name(team)}`}
            >
              {name(team)}
            </button>
            {match.kind === 'real' && pick?.team === team && <PickMark pick={pick} />}
            {match.kind === 'real' ? (
              <span
                className={`num min-w-4 text-right text-sm ${won ? 'font-semibold text-ink' : 'text-ink-3'}`}
                title={pMarket === undefined ? undefined : `Market ${pct(pMarket)}`}
              >
                {index === 0 ? scoreA : scoreB}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onPick(match, team)}
                className={[
                  'num -mr-1 self-stretch rounded-sm px-1 text-xs',
                  match.kind === 'override'
                    ? won
                      ? 'font-semibold text-accent'
                      : 'text-ink-3'
                    : 'text-accent hover:bg-accent-soft',
                ].join(' ')}
                title={
                  match.kind === 'override' && won
                    ? 'Clear override'
                    : `Force ${name(team)} to win${marketNote}`
                }
              >
                {match.kind === 'override' ? (won ? 'W*' : 'L') : p === undefined ? '…' : pct(p)}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The model's pre-match pick on a finished match: green ✓ if it won, red and crossed out if not. */
function PickMark({ pick }: { pick: Pick }) {
  const label =
    pick.verdict === 'coin-flip'
      ? `Coin flip: the model gave ${pct(pick.p)} before the match`
      : `Model's pick before the match: ${pct(pick.p)}, ${pick.verdict === 'hit' ? 'won' : 'lost'}`
  return (
    <span
      className={[
        'num shrink-0 text-xs font-semibold',
        pick.verdict === 'hit' ? 'text-win' : pick.verdict === 'miss' ? 'text-loss' : 'text-ink-3',
      ].join(' ')}
      title={label}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">
        <span className={pick.verdict === 'miss' ? 'line-through' : ''}>{pct(pick.p)}</span>
        {pick.verdict === 'hit' && ' ✓'}
        {pick.verdict === 'miss' && ' ✗'}
      </span>
    </span>
  )
}

interface Final {
  team: string
  wins: number
  losses: number
  /** Reached through a what-if override, not only real results. */
  override: boolean
}

/** Teams that reached a final record (3 wins or 3 losses), in the order they got there. */
function finalRecords(rounds: BracketRound[], winsToAdvance: number, losses: number): Final[] {
  const tally = new Map<string, Final>()
  const done: Final[] = []
  for (const round of rounds) {
    for (const group of round.groups) {
      for (const match of group.matches) {
        if (!match.winner) continue
        for (const team of [match.teamA, match.teamB]) {
          const t = tally.get(team) ?? { team, wins: 0, losses: 0, override: false }
          if (team === match.winner) t.wins++
          else t.losses++
          if (match.kind === 'override') t.override = true
          tally.set(team, t)
          if (t.wins === winsToAdvance || t.losses === losses) done.push({ ...t })
        }
      }
    }
  }
  return done
}

function ResultBox(props: {
  slot: ResultSlot
  finals: Final[]
  selected: string | undefined
  name: (teamId: string) => string
  short: (teamId: string) => string
  onSelect: (teamId: string) => void
}) {
  const { slot, finals, selected, name, short, onSelect } = props
  const advanced = slot.outcome === 'advanced'
  const columns = resultColumns(slot)
  const cells: Array<{ label: string; teams: Array<Final | undefined> }> =
    slot.records.length >= 2
      ? slot.records.map((r) => ({
          label: `${r.wins}-${r.losses}`,
          teams: fill(
            finals.filter((f) => f.wins === r.wins && f.losses === r.losses),
            r.size,
          ),
        }))
      : (() => {
          const r = slot.records[0]
          if (!r) return []
          const teams = fill(
            finals.filter((f) => f.wins === r.wins && f.losses === r.losses),
            r.size,
          )
          const perColumn = Math.ceil(r.size / columns)
          return Array.from({ length: columns }, (_, i) => ({
            label: i === 0 ? `${r.wins}-${r.losses}` : '',
            teams: teams.slice(i * perColumn, (i + 1) * perColumn),
          }))
        })()

  return (
    <section
      className={`absolute rounded-md border border-rule border-t-2 bg-paper-2 px-2 ${advanced ? 'border-t-win' : 'border-t-loss'}`}
      style={{ left: slot.x, top: slot.y, width: LAYOUT.columnWidth, height: slot.height }}
      aria-label={advanced ? 'Advanced' : 'Eliminated'}
    >
      <div
        className={`pt-1.5 font-display text-xs font-semibold uppercase tracking-wider ${advanced ? 'text-win' : 'text-loss'}`}
      >
        {advanced ? 'Advanced' : 'Eliminated'}
      </div>
      <div
        className="grid gap-x-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cells.map((cell, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed by the format.
          <div key={i} className="flex min-w-0 flex-col">
            <div className="num h-[18px] font-display text-sm font-semibold text-ink-2">
              {cell.label}
            </div>
            {cell.teams.map((f, j) =>
              f ? (
                <button
                  key={f.team}
                  type="button"
                  onClick={() => onSelect(f.team)}
                  title={`Show ${name(f.team)}`}
                  className={[
                    'flex min-w-0 items-center gap-1.5 text-left text-sm',
                    f.override ? 'text-accent' : 'text-ink',
                    selected === f.team
                      ? 'underline decoration-accent decoration-2 underline-offset-2'
                      : '',
                  ].join(' ')}
                  style={{ height: LAYOUT.resultRow }}
                >
                  <TeamLogo teamId={f.team} />
                  <span className="truncate">{short(f.team)}</span>
                </button>
              ) : (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: empty places have no identity.
                  key={j}
                  className="flex items-center"
                  style={{ height: LAYOUT.resultRow }}
                >
                  <div className="h-4 w-full rounded-sm border border-dashed border-rule" />
                </div>
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function fill<T>(items: T[], size: number): Array<T | undefined> {
  return Array.from({ length: size }, (_, i) => items[i])
}

/** Where the winners and losers of a group go: the next round's group, or a result box. */
function target(slots: readonly Slot[], from: GroupSlot, wins: number, losses: number) {
  return slots.find((s) =>
    s.kind === 'group'
      ? s.round === from.round + 1 && s.wins === wins && s.losses === losses
      : s.records.some((r) => r.wins === wins && r.losses === losses),
  )
}

/** A horizontal-vertical-horizontal path with rounded corners. */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1
  if (Math.abs(dy) < 1) return `M${x1},${y1} H${x2}`
  const mid = x1 + (x2 - x1) / 2
  const r = Math.min(8, Math.abs(dy) / 2, (x2 - x1) / 4)
  const s = Math.sign(dy)
  return `M${x1},${y1} H${mid - r} Q${mid},${y1} ${mid},${y1 + s * r} V${y2 - s * r} Q${mid},${y2} ${mid + r},${y2} H${x2}`
}

/**
 * Lines from each group to where its winners (green, up) and losers (red, down) go. Solid once the
 * group's matches are all played, dashed while they are still predictions.
 */
function Connectors({ slots, rounds }: { slots: Slot[]; rounds: BracketRound[] }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const lines: Array<{ d: string; win: boolean; done: boolean }> = []
  const center = (s: Slot) => s.y + s.height / 2
  for (const from of slots) {
    if (from.kind !== 'group') continue
    const group = rounds
      .find((r) => r.round === from.round)
      ?.groups.find((g) => g.record === `${from.wins}-${from.losses}`)
    const done = group?.matches.every((m) => m.kind !== 'pending') ?? false
    for (const win of [true, false]) {
      const to = target(slots, from, from.wins + (win ? 1 : 0), from.losses + (win ? 0 : 1))
      if (!to) continue
      const mid = from.x + LAYOUT.columnWidth / 2
      if (to.round === from.round) {
        // Same column (2-2 to 3-2 / 2-3): a short vertical arrow.
        lines.push({
          d: win
            ? `M${mid},${from.y - 2} V${to.y + to.height + 2}`
            : `M${mid},${from.y + from.height + 2} V${to.y - 2}`,
          win,
          done,
        })
        continue
      }
      const body = from.height - LAYOUT.headerHeight
      const y1 = from.y + LAYOUT.headerHeight + body * (win ? 0.3 : 0.7)
      const fromAbove = center(from) < center(to)
      const y2 = to.kind === 'result' ? center(to) : to.y + to.height * (fromAbove ? 0.35 : 0.65)
      lines.push({ d: elbow(from.x + LAYOUT.columnWidth + 2, y1, to.x - 3, y2), win, done })
    }
  }
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        {(['win', 'loss'] as const).map((kind) => (
          <marker
            key={kind}
            id={`${id}-${kind}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 z" fill={`var(--${kind})`} />
          </marker>
        ))}
      </defs>
      {lines.map(({ d, win, done }) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={win ? 'var(--win)' : 'var(--loss)'}
          strokeWidth={2}
          strokeDasharray={done ? undefined : '5 4'}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={`url(#${id}-${win ? 'win' : 'loss'})`}
          opacity={done ? 1 : 0.7}
        />
      ))}
    </svg>
  )
}
