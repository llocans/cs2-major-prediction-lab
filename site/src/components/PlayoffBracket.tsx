import type { MatchFormat } from '../../../data/schemas/common.ts'
import type { BracketMatch } from '../../../engine/playoffs/bracket.ts'
import { pct } from '../lib/format.ts'

/** How a decided match was decided. */
export type MatchKind = 'real' | 'override'

interface Props {
  matches: BracketMatch[]
  rounds: number
  /** The stage's usual format; other formats (e.g. a Bo5 final) are labelled. */
  defaultFormat: MatchFormat
  /** Real or override, keyed by pair; undecided matches are absent. */
  kinds: Map<string, MatchKind>
  /** Real series score "2-1" (teamA first), keyed by pair. */
  scores: Map<string, string>
  /** Probability that teamA wins an open match, keyed by pair. */
  pending: Map<string, number>
  name: (teamId: string) => string
  seedOf: (teamId: string) => number | undefined
  /** Absent: no what-ifs (e.g. before the seeds are known). */
  onPick?: (match: BracketMatch, winner: string) => void
  /** Note shown under the final, e.g. an unverified veto. */
  finalNote?: string
}

const COLUMN = 212
const GAP = 44
const MATCH = 52
const ROW_GAP = 18
const HEADER = 24
const THIRD_GAP = 44

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function roundName(round: number, rounds: number): string {
  if (round === rounds) return 'Final'
  if (round === rounds - 1) return 'Semifinals'
  if (round === rounds - 2) return 'Quarterfinals'
  return `Round ${round}`
}

/** Single-elimination bracket: first round on the left, the final (and third place) on the right. */
export function PlayoffBracket(props: Props) {
  const { matches, rounds, finalNote } = props
  const firstRound = matches.filter((m) => m.round === 1 && !m.thirdPlace).length
  const top = (round: number, index: number): number => {
    if (round === 1) return HEADER + index * (MATCH + ROW_GAP)
    return (top(round - 1, index * 2) + top(round - 1, index * 2 + 1)) / 2
  }
  const left = (round: number) => (round - 1) * (COLUMN + GAP)
  const finalTop = top(rounds, 0)
  const third = matches.find((m) => m.thirdPlace)
  const thirdTop = finalTop + MATCH + THIRD_GAP
  const width = rounds * COLUMN + (rounds - 1) * GAP
  const height = Math.max(HEADER + firstRound * (MATCH + ROW_GAP), third ? thirdTop + MATCH + 8 : 0)

  const lines = matches
    .filter((m) => !m.thirdPlace && m.round < rounds)
    .map((m) => {
      const x1 = left(m.round) + COLUMN
      const y1 = top(m.round, m.index) + MATCH / 2
      const x2 = left(m.round + 1)
      const y2 = top(m.round + 1, Math.floor(m.index / 2)) + MATCH / 2
      const mid = x1 + GAP / 2
      const decidedForReal =
        m.teamA !== undefined &&
        m.teamB !== undefined &&
        props.kinds.get(pairKey(m.teamA, m.teamB)) === 'real'
      return { d: `M${x1},${y1} H${mid} V${y2} H${x2}`, dashed: !decidedForReal }
    })

  return (
    <section className="overflow-x-auto pb-2" aria-label="Playoff bracket">
      <div className="relative" style={{ width, height }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {lines.map((line) => (
            <path
              key={line.d}
              d={line.d}
              fill="none"
              stroke="var(--rule)"
              strokeWidth={1}
              strokeDasharray={line.dashed ? '3 3' : undefined}
            />
          ))}
        </svg>
        {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => (
          <div
            key={round}
            className="absolute font-display text-xs font-semibold uppercase tracking-wider text-ink-3"
            style={{ left: left(round), top: 0 }}
          >
            {roundName(round, rounds)}
          </div>
        ))}
        {matches
          .filter((m) => !m.thirdPlace)
          .map((m) => (
            <div
              key={`${m.round}-${m.index}`}
              className="absolute"
              style={{ left: left(m.round), top: top(m.round, m.index), width: COLUMN }}
            >
              <MatchBox match={m} {...props} />
            </div>
          ))}
        {finalNote && (
          <p
            className="absolute text-[11px] leading-tight text-ink-3"
            style={{ left: left(rounds), top: finalTop + MATCH + 4, width: COLUMN }}
          >
            {finalNote}
          </p>
        )}
        {third && (
          <div
            className="absolute"
            style={{ left: left(rounds), top: thirdTop - 20, width: COLUMN }}
          >
            <div className="mb-1 font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
              Third place
            </div>
            <MatchBox match={third} {...props} />
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * The teams to show in a match. Once both are known, the higher seed first (the engine's order).
 * Before that, whichever team is already through, in the slot of the match it came from.
 */
function shownTeams(match: BracketMatch, all: readonly BracketMatch[]): Array<string | undefined> {
  if (match.teamA !== undefined && match.teamB !== undefined) return [match.teamA, match.teamB]
  if (match.round === 1) return [undefined, undefined]
  const feeder = (index: number) =>
    all.find((m) => !m.thirdPlace && m.round === match.round - 1 && m.index === index)
  const [top, bottom] = match.thirdPlace ? [0, 1] : [match.index * 2, match.index * 2 + 1]
  const through = (m: BracketMatch | undefined) =>
    m?.winner === undefined
      ? undefined
      : match.thirdPlace
        ? m.winner === m.teamA
          ? m.teamB
          : m.teamA
        : m.winner
  return [through(feeder(top)), through(feeder(bottom))]
}

function MatchBox(props: Props & { match: BracketMatch }) {
  const { match, matches, kinds, scores, pending, name, seedOf, onPick } = props
  const key = match.teamA && match.teamB ? pairKey(match.teamA, match.teamB) : ''
  const kind = kinds.get(key)
  const pA = pending.get(key)
  const [scoreA, scoreB] = (scores.get(key) ?? '').split('-')
  const [first, second] = shownTeams(match, matches)
  const sides = [
    { team: first, p: pA, score: scoreA },
    { team: second, p: pA === undefined ? undefined : 1 - pA, score: scoreB },
  ]

  return (
    <div
      className="grid rounded-sm border border-rule bg-paper"
      style={{ height: MATCH, gridTemplateRows: '1fr 1fr' }}
    >
      {sides.map(({ team, p, score }, index) => {
        const won = team !== undefined && match.winner === team
        const lost = match.winner !== undefined && !won
        const seed = team === undefined ? undefined : seedOf(team)
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the two sides of a match.
            key={index}
            className={[
              'flex items-center gap-1.5 px-2 text-[13px] leading-none',
              index === 0 ? 'border-b border-rule' : '',
              won && kind === 'override' ? 'bg-accent-soft' : '',
            ].join(' ')}
          >
            <span className="num w-3 text-right text-[11px] text-ink-3">{seed ?? ''}</span>
            <span
              className={[
                'min-w-0 flex-1 truncate',
                team === undefined
                  ? 'text-ink-3'
                  : won
                    ? 'font-semibold text-ink'
                    : lost
                      ? 'text-ink-3'
                      : 'text-ink',
              ].join(' ')}
            >
              {team === undefined ? 'TBD' : name(team)}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-ink-3">
              {index === 0 && match.format !== props.defaultFormat ? match.format : ''}
            </span>
            {kind === 'real' ? (
              <span className={`num text-xs ${won ? 'font-semibold text-ink' : 'text-ink-3'}`}>
                {score}
              </span>
            ) : team !== undefined && match.teamA && match.teamB && onPick ? (
              <button
                type="button"
                onClick={() => onPick(match, team)}
                aria-pressed={kind === 'override' && won}
                aria-label={
                  kind === 'override' && won
                    ? `${name(team)} forced to win; clear the override`
                    : `Force ${name(team)} to win${p === undefined || kind === 'override' ? '' : ` (now ${pct(p)})`}`
                }
                className={[
                  'num -my-1 min-h-6 rounded-sm px-1.5 text-xs',
                  kind === 'override'
                    ? won
                      ? 'font-semibold text-accent'
                      : 'text-ink-3'
                    : 'text-accent hover:bg-accent-soft',
                ].join(' ')}
                title={kind === 'override' && won ? 'Clear override' : `Force ${name(team)} to win`}
              >
                {kind === 'override' ? (won ? 'W*' : 'L') : p === undefined ? '…' : pct(p)}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
