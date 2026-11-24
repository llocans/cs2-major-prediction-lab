import type { BracketMatch, BracketRound } from '../../../engine/swiss/bracket.ts'
import { pct } from '../lib/format.ts'
import type { Pick } from '../lib/verdict.ts'
import { bracketSize, type GroupSlot, groupSlots, LAYOUT } from './bracket-layout.ts'
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
  /** The market's chance that `team` beats `opponent` in a round, if logged (shown on hover). */
  market?: (round: number, team: string, opponent: string) => number | undefined
  onPick: (match: BracketMatch, winner: string) => void
  onSelect: (teamId: string) => void
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function SwissBracket(props: Props) {
  const { rounds, pending, scores, picks, selected, name, market, onPick, onSelect } = props
  const slots = groupSlots(16, rounds.length, 3, 3)
  const { width, height } = bracketSize(slots)

  return (
    <section className="overflow-x-auto pb-2" aria-label="Swiss bracket">
      <div className="relative" style={{ width, height }}>
        <Connectors slots={slots} />
        {rounds.map((round) => (
          <div
            key={round.round}
            className="absolute font-display text-xs font-semibold uppercase tracking-wider text-ink-3"
            style={{ left: (round.round - 1) * (LAYOUT.columnWidth + LAYOUT.columnGap), top: 0 }}
          >
            Round {round.round}
          </div>
        ))}
        {slots.map((slot) => {
          const round = rounds.find((r) => r.round === slot.round)
          const record = `${slot.wins}-${slot.losses}`
          const group = round?.groups.find((g) => g.record === record)
          const decider = slot.wins === 2 || slot.losses === 2
          return (
            <section
              key={`${slot.round}-${record}`}
              className="absolute rounded-md border border-rule bg-paper"
              style={{ left: slot.x, top: slot.y, width: LAYOUT.columnWidth, height: slot.height }}
            >
              <header
                className="flex items-baseline justify-between px-2 font-display text-sm font-semibold text-ink-2"
                style={{ height: LAYOUT.headerHeight, lineHeight: `${LAYOUT.headerHeight}px` }}
              >
                <span className="num">{record}</span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
                  {decider
                    ? slot.wins === 2 && slot.losses === 2
                      ? 'decider'
                      : slot.wins === 2
                        ? 'for playoffs'
                        : 'elimination'
                    : ''}
                </span>
              </header>
              <div className="flex flex-col px-1.5" style={{ gap: LAYOUT.matchGap }}>
                {group
                  ? group.matches.map((match) => (
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
                    ))
                  : Array.from({ length: slot.size / 2 }, (_, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
                        key={i}
                        className="rounded-sm border border-dashed border-rule"
                        style={{ height: LAYOUT.matchHeight }}
                      />
                    ))}
              </div>
            </section>
          )
        })}
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
      className="grid rounded-sm border border-rule bg-paper"
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
              'flex items-center gap-1 px-1.5 text-[13px] leading-none',
              index === 0 ? 'border-b border-rule' : '',
              won && match.kind === 'override' ? 'bg-accent-soft' : '',
            ].join(' ')}
          >
            <TeamLogo teamId={team} />
            <button
              type="button"
              className={[
                'min-w-0 flex-1 truncate text-left',
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
                className={`num text-xs ${won ? 'font-semibold text-ink' : 'text-ink-3'}`}
                title={pMarket === undefined ? undefined : `Market ${pct(pMarket)}`}
              >
                {index === 0 ? scoreA : scoreB}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onPick(match, team)}
                className={[
                  'num rounded-sm px-1 text-xs',
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

/** Lines from each group to the groups its winners and losers move to. */
function Connectors({ slots }: { slots: GroupSlot[] }) {
  const paths: string[] = []
  for (const from of slots) {
    for (const [dw, dl] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const to = slots.find(
        (s) =>
          s.round === from.round + 1 && s.wins === from.wins + dw && s.losses === from.losses + dl,
      )
      if (!to) continue
      const x1 = from.x + LAYOUT.columnWidth
      const y1 = from.y + from.height / 2 + (dw ? -8 : 8)
      const x2 = to.x
      const y2 = to.y + LAYOUT.headerHeight / 2
      const mid = x1 + (x2 - x1) / 2
      paths.push(`M${x1},${y1} H${mid} V${y2} H${x2}`)
    }
  }
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--rule)" strokeWidth={1} />
      ))}
    </svg>
  )
}
