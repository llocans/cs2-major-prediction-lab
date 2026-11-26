import { type ReactNode, useId } from 'react'
import type { MatchFormat } from '../../../data/schemas/common.ts'
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
  /** Short name (e.g. "NIP"): the bracket's label for a team; the full name shows on hover. */
  short: (teamId: string) => string
  /** Match format of a record group (e.g. bo3 for 2-0), also before its pairings are known. */
  formatFor: (wins: number, losses: number) => MatchFormat
  winsToAdvance: number
  lossesToEliminate: number
  /** The market's chance that `team` beats `opponent` in a round and its source, if logged (hover). */
  market?: (
    round: number,
    team: string,
    opponent: string,
  ) => { p: number; source?: string } | undefined
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
              format={props.formatFor(slot.wins, slot.losses)}
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
                  short={short}
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
  format: MatchFormat
  winsToAdvance: number
  lossesToEliminate: number
  render: (match: BracketMatch) => ReactNode
}) {
  const { slot, rounds, format, winsToAdvance, lossesToEliminate, render } = props
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
      className="absolute flex flex-col rounded-md border border-rule bg-paper-2"
      style={{ left: slot.x, top: slot.y, width: LAYOUT.columnWidth, height: slot.height }}
      aria-label={`${record} group`}
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b border-rule px-2 font-display"
        style={{ height: LAYOUT.headerHeight }}
      >
        <span className="num text-base font-bold text-ink">{record}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">{format}</span>
        <span className="ml-auto text-xs font-semibold uppercase tracking-wider text-ink-3">
          {tag}
        </span>
      </header>
      <div className="flex flex-col" style={{ gap: LAYOUT.matchGap, padding: LAYOUT.panelPadding }}>
        {group
          ? group.matches.map(render)
          : Array.from({ length: slot.size / 2 }, (_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
                key={i}
                className="grid rounded-sm border border-rule bg-paper"
                style={{ height: LAYOUT.matchHeight, gridTemplateRows: '1fr 1fr' }}
                aria-hidden="true"
              >
                {[0, 1].map((row) => (
                  <div
                    key={row}
                    className={`flex items-center px-2 ${row === 0 ? 'border-b border-rule' : ''}`}
                  >
                    <span className="h-5 w-5 rounded-full border border-rule" />
                  </div>
                ))}
              </div>
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
  short: (teamId: string) => string
  market?: (
    round: number,
    team: string,
    opponent: string,
  ) => { p: number; source?: string } | undefined
  onPick: (match: BracketMatch, winner: string) => void
  onSelect: (teamId: string) => void
}) {
  const { match, pA, score, pick, selected, name, short, market, onPick, onSelect } = props
  const sides = [
    { team: match.teamA, p: pA },
    { team: match.teamB, p: pA === undefined ? undefined : 1 - pA },
  ]
  const [scoreA, scoreB] = (score ?? '').split('-')
  const done = match.kind !== 'pending'

  return (
    <div
      className="grid overflow-hidden rounded-sm border border-rule bg-paper"
      style={{ height: LAYOUT.matchHeight, gridTemplateRows: '1fr 1fr' }}
    >
      {sides.map(({ team, p }, index) => {
        const won = match.winner === team
        const lost = done && !won
        const isSelected = selected === team
        const opponent = team === match.teamA ? match.teamB : match.teamA
        const quote = market?.(match.round, team, opponent)
        const marketText = quote
          ? `Market ${pct(quote.p)}${quote.source ? ` (${quote.source})` : ''}`
          : undefined
        const marketNote = quote
          ? ` · market ${pct(quote.p)}${quote.source ? ` (${quote.source})` : ''}`
          : ''
        return (
          <div
            key={team}
            className={[
              'flex items-center gap-1.5 px-2 text-sm leading-none',
              index === 0 ? 'border-b border-rule' : '',
              // A soft tint marks the selected team, so even a short name (CW) stands out.
              isSelected || (won && match.kind === 'override') ? 'bg-accent-soft' : '',
            ].join(' ')}
          >
            <TeamLogo teamId={team} size="md" />
            <button
              type="button"
              className={[
                'min-w-0 flex-1 self-stretch truncate text-left',
                won ? 'font-semibold text-ink' : lost ? 'text-ink-3' : 'text-ink',
                isSelected
                  ? 'underline decoration-accent decoration-2 underline-offset-[5px] [text-decoration-skip-ink:none]'
                  : '',
              ].join(' ')}
              onClick={() => onSelect(team)}
              title={`Show ${name(team)}`}
            >
              {short(team)}
            </button>
            {match.kind === 'real' && pick?.team === team && <PickMark pick={pick} />}
            {match.kind === 'real' ? (
              <span
                className={`num min-w-4 text-right text-sm ${won ? 'font-semibold text-ink' : 'text-ink-3'}`}
                title={marketText}
              >
                {index === 0 ? scoreA : scoreB}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onPick(match, team)}
                // A what-if win is the viewer's own pick, not a prediction: it never pulses.
                data-keep-accent={match.kind === 'override' || undefined}
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

/**
 * The model's pre-match pick on a finished match: muted green ✓ if it won, muted red and crossed out
 * if not, close calls included.
 */
function PickMark({ pick }: { pick: Pick }) {
  const label = `Model's pick before the match: ${pct(pick.p)}, ${pick.verdict === 'hit' ? 'won' : 'lost'}`
  return (
    <span
      className={[
        'num shrink-0 text-xs font-semibold',
        pick.verdict === 'hit' ? 'text-win-muted' : 'text-loss-muted',
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
      className={`absolute rounded-md border px-2 ${advanced ? 'border-win/40 bg-win-soft' : 'border-loss/40 bg-loss-soft'}`}
      style={{ left: slot.x, top: slot.y, width: LAYOUT.columnWidth, height: slot.height }}
      aria-label={advanced ? 'Advanced' : 'Eliminated'}
    >
      <div
        className={`pt-2 font-display text-xs font-bold uppercase tracking-wider ${advanced ? 'text-win' : 'text-loss'}`}
      >
        {advanced ? 'Advanced' : 'Eliminated'}
      </div>
      <div
        className="grid gap-x-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cells.map((cell, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed by the format.
          <div key={i} className="flex min-w-0 flex-col">
            <div
              className={`num h-[18px] font-display text-base font-bold ${advanced ? 'text-win' : 'text-loss'}`}
            >
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
                      ? 'bg-accent-soft underline decoration-accent decoration-2 underline-offset-[5px] [text-decoration-skip-ink:none]'
                      : '',
                  ].join(' ')}
                  style={{ height: LAYOUT.resultRow }}
                >
                  <TeamLogo teamId={f.team} size="md" />
                  <span className="truncate">{short(f.team)}</span>
                </button>
              ) : (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: empty places have no identity.
                  key={j}
                  className="flex items-center"
                  style={{ height: LAYOUT.resultRow }}
                >
                  <span
                    className={`h-5 w-5 rounded-full border ${advanced ? 'border-win/30' : 'border-loss/30'}`}
                  />
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

/** The short arrows after each group: how far they reach and how steeply they climb or drop. */
const ARROW = { inset: 7, rise: 14, spread: 5, vertical: 18, edge: 4, margin: 12 }

/**
 * Where an arrow starts: as close to `wanted` as possible while inside its own group's range and the
 * range that puts its tip beside the target. If the two don't overlap, the end of the group's
 * range nearest the target.
 */
function slide(wanted: number, own: [number, number], aim: [number, number]): number {
  const lo = Math.max(own[0], aim[0])
  const hi = Math.min(own[1], aim[1])
  if (lo <= hi) return Math.min(Math.max(wanted, lo), hi)
  return aim[1] < own[0] ? own[0] : own[1]
}

/**
 * The same pair of short arrows after every group: winners up-right (green), losers down-right
 * (red). They point the way instead of reaching the target, so every pair looks the same. The 2-2
 * group, whose 3-2 and 2-3 boxes sit above and below it in the same column, gets short vertical
 * arrows instead. Solid once the group's matches are all played, dashed while they are predictions.
 */
function Connectors({ slots, rounds }: { slots: Slot[]; rounds: BracketRound[] }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const lines: Array<{ d: string; win: boolean; done: boolean }> = []
  for (const from of slots) {
    if (from.kind !== 'group') continue
    const group = rounds
      .find((r) => r.round === from.round)
      ?.groups.find((g) => g.record === `${from.wins}-${from.losses}`)
    // What-if overrides are still predictions: only real results make the arrows solid.
    const done = group?.matches.every((m) => m.kind === 'real') ?? false
    const body = from.y + LAYOUT.headerHeight + (from.height - LAYOUT.headerHeight) / 2
    for (const win of [true, false]) {
      const to = target(slots, from, from.wins + (win ? 1 : 0), from.losses + (win ? 0 : 1))
      if (!to) continue
      if (to.round === from.round) {
        const mid = from.x + LAYOUT.columnWidth / 2
        const y = win ? from.y - ARROW.edge : from.y + from.height + ARROW.edge
        const end = win ? y - ARROW.vertical : y + ARROW.vertical
        lines.push({ d: `M${mid},${y} V${end}`, win, done })
        continue
      }
      const x1 = from.x + LAYOUT.columnWidth + ARROW.inset
      const x2 = from.x + LAYOUT.columnWidth + LAYOUT.columnGap - ARROW.inset
      const s = win ? -1 : 1
      // Same length and angle everywhere; only the start slides along the group's edge, so the tip
      // lands beside its target and never next to another box.
      const own: [number, number] = [from.y + ARROW.margin, from.y + from.height - ARROW.margin]
      const aim: [number, number] = [
        to.y + ARROW.margin - s * ARROW.rise,
        to.y + to.height - ARROW.margin - s * ARROW.rise,
      ]
      const y1 = slide(body + s * ARROW.spread, own, aim)
      lines.push({ d: `M${x1},${y1} L${x2},${y1 + s * ARROW.rise}`, win, done })
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
