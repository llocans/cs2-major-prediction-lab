import type { ReactNode } from 'react'
import type { MatchPrediction, TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { LITTLE_DATA_RD } from '../../../engine/explain.ts'
import { forms, ratings } from '../lib/data.ts'
import { outcomeOpen, pct, shortDate } from '../lib/format.ts'
import type { TeamMatchRow } from '../lib/market.ts'
import { chanceVerdict } from '../lib/verdict.ts'
import { TeamLogo } from './TeamLogo.tsx'

interface Props {
  teamId: string
  /** Seed in the stage being shown (entry or advanced seed). */
  seed?: number
  outlook?: TeamOutlook
  next?: MatchPrediction
  /** The round `next` is played in. */
  nextRound?: number
  /** The market's chance for this team in its next match and its source, if logged. */
  nextMarket?: { p: number; source?: string }
  /** This team's matches in the stage so far. */
  matches?: TeamMatchRow[]
  /** The team's name at this event, for the heading. */
  name: string
  /** Short name (e.g. "NIP") for running text. */
  short: (teamId: string) => string
  /** Short name for an opponent as written in Valve's VRS tables, if we know the team. */
  shortFromVrs: (vrsName: string) => string
  /** Closes the panel (clears the selected team). */
  onClose: () => void
  /** A finished stage: the rest of the panel is final, the rating is today's (labelled "now"). */
  finished?: boolean
}

export function TeamPanel(props: Props) {
  const {
    teamId,
    seed,
    outlook,
    next,
    nextRound,
    nextMarket,
    matches = [],
    name,
    short,
    onClose,
    finished = false,
  } = props
  const played = matches.filter((m) => m.result !== undefined)
  const form = forms.get(teamId)
  const rating = ratings.teams[teamId]
  const opponent = next ? (next.teamA === teamId ? next.teamB : next.teamA) : undefined
  const pNext = next ? (next.teamA === teamId ? next.pA : 1 - next.pA) : undefined
  // Teams in the next match with few tier-1 series (the same check as the model's reasons).
  const unsure = next
    ? [next.teamA, next.teamB].filter((t) => (ratings.teams[t]?.rd ?? 0) >= LITTLE_DATA_RD)
    : []
  // The coming match, as the last row of "This stage" (so the panel keeps one shape for every team).
  const upcoming =
    next && opponent && pNext !== undefined && nextRound !== undefined
      ? { round: nextRound, opponent, format: next.format, p: pNext }
      : undefined

  return (
    // Beside the table it is one 340 px column. Above it (below 1024 px) it keeps that width and is
    // centred, so its text never stretches; from 768 px match history takes a second column.
    <aside
      className="flex flex-col gap-6 max-lg:mx-auto max-lg:w-full max-lg:max-w-[340px] md:max-lg:grid md:max-lg:max-w-[744px] md:max-lg:grid-cols-[minmax(0,340px)_minmax(0,340px)] md:max-lg:items-start md:max-lg:gap-x-16"
      aria-label={`${name} details`}
    >
      <header className="relative border-b border-ink pb-3 pr-10 md:max-lg:col-span-2">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-0 right-0 flex size-9 items-center justify-center rounded-sm text-lg leading-none text-ink-3 hover:bg-paper-2 hover:text-ink"
          aria-label={`Close ${name} details`}
          title="Close"
        >
          ✕
        </button>
        <div className="font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
          Seed {seed ?? '–'}
          {form && ` · VRS #${form.vrs.rank}`}
        </div>
        <h2 className="flex items-center gap-3 font-display text-3xl font-bold leading-tight">
          <TeamLogo teamId={teamId} size="lg" />
          {name}
        </h2>
        {rating && (
          <div className="num text-sm text-ink-2">
            Rating {finished && 'now '}
            {Math.round(rating.rating)} ± {Math.round(rating.rd)}
            {rating.rd >= LITTLE_DATA_RD && <span className="text-ink-3"> · little data</span>}
          </div>
        )}
      </header>

      {outlook && (
        <dl className="grid grid-cols-3 gap-2 md:max-lg:col-start-1 md:max-lg:row-start-2">
          {(
            [
              ['3-0', outlook.p30],
              ['Advance', outlook.pAdvance],
              ['0-3', outlook.p03],
            ] as const
          ).map(([label, value]) => {
            const open = label === 'Advance' || outcomeOpen(outlook.record, label)
            return (
              <div key={label} className="text-center">
                <dt className={LABEL}>{label}</dt>
                <dd
                  className={`num font-display text-2xl font-semibold ${open ? 'text-accent' : 'text-ink-3'}`}
                  title={open ? undefined : `No longer possible at ${outlook.record}`}
                >
                  {open ? pct(value) : '–'}
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      {(played.length > 0 || upcoming) && (
        <Section title="This stage" className="md:max-lg:col-start-1 md:max-lg:row-start-3">
          {/* Fixed columns, so switching teams never moves them. */}
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className={LABEL}>
                <th className="w-8 pb-1 text-left font-normal">Rd</th>
                <th className="w-11 pb-1 text-left font-normal" />
                <th className="pb-1 text-left font-normal">Opponent</th>
                <th className="w-16 pb-1 pr-4 text-right font-normal">Model</th>
                <th
                  className="w-14 pb-1 text-right font-normal"
                  title="Betting odds without the bookmaker margin"
                >
                  Market
                </th>
              </tr>
            </thead>
            <tbody>
              {played.map((m) => (
                <tr key={m.round} className="num">
                  <td className="py-0.5 text-ink-3">R{m.round}</td>
                  <td
                    className={`py-0.5 font-semibold ${m.result === 'W' ? 'text-win' : 'text-loss'}`}
                  >
                    {m.result}
                  </td>
                  <td className="truncate py-0.5">{short(m.opponent)}</td>
                  <td className="py-0.5 text-right">
                    <ModelChance p={m.model} won={m.result === 'W'} />
                  </td>
                  <td className="py-0.5 text-right text-ink-2">
                    <span title={m.marketSource}>
                      {m.market === undefined ? '–' : pct(m.market)}
                    </span>
                  </td>
                </tr>
              ))}
              {upcoming && (
                <tr className="num">
                  <td className="py-0.5 text-ink-3">R{upcoming.round}</td>
                  <td className="py-0.5 font-display text-xs font-semibold uppercase tracking-wider text-accent">
                    Next
                  </td>
                  <td className="truncate py-0.5">
                    {short(upcoming.opponent)}{' '}
                    <span className="text-xs text-ink-3">{upcoming.format.toUpperCase()}</span>
                  </td>
                  <td className="py-0.5 text-right">
                    <span className="font-semibold text-accent">{pct(upcoming.p)}</span>
                    <span className="inline-block w-4" />
                  </td>
                  <td className="py-0.5 text-right text-ink-2">
                    <span
                      title={
                        nextMarket === undefined
                          ? 'No odds logged for this match yet'
                          : nextMarket.source
                      }
                    >
                      {nextMarket === undefined ? '–' : pct(nextMarket.p)}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-1.5 text-xs text-ink-3">
            Odds before match start{upcoming ? '; NEXT is not played yet' : ''}.
          </p>
          {unsure.length > 0 && (
            <p className="mt-1 text-xs text-ink-3">
              Little data on {unsure.map(short).join(' and ')} (few tier-1 matches), so the next
              match's odds are rough.
            </p>
          )}
        </Section>
      )}

      {form && (
        <Section
          title={`Match history · 90 days to ${shortDate(form.asOf)}`}
          // In the second column it starts level with the outlook, so it needs no line above it.
          className="md:max-lg:col-start-2 md:max-lg:row-span-2 md:max-lg:row-start-2 md:max-lg:border-t-0 md:max-lg:pt-0"
        >
          <p
            className="num text-sm"
            title="Series won and lost in the 90 days before this date, from Valve's ranking tables"
          >
            <span className="font-semibold text-win-muted">{form.summary.last90Days.won} W</span>
            <span className="text-ink-3"> – </span>
            <span className="font-semibold text-loss">{form.summary.last90Days.lost} L</span>
          </p>
          <ol className="mt-2 flex flex-col gap-0.5 text-sm">
            {form.recent.slice(0, 6).map((series, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: the same opponent can appear twice on one day; the list never reorders.
                key={`${i}-${series.date}-${series.opponent}`}
                className="num flex gap-3 text-ink-2"
              >
                <span className="w-14 shrink-0 whitespace-nowrap text-ink-3">
                  {shortDate(series.date)}
                </span>
                <span
                  className={`w-3 shrink-0 font-semibold ${series.result === 'W' ? 'text-win' : 'text-loss'}`}
                >
                  {series.result}
                </span>
                <span className="truncate">
                  {props.shortFromVrs(series.opponent)}
                  {series.opponentRank && (
                    <span className="text-ink-3"> #{series.opponentRank}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </aside>
  )
}

/** One style for every small label in the panel (outlook, table headers). */
const LABEL = 'font-display text-xs uppercase tracking-wider text-ink-3'

/** A titled part of the panel, set off from the one above by a thin line. */
function Section(props: { title: string; className?: string; children: ReactNode }) {
  const { title, className = '', children } = props
  return (
    <section className={`border-t border-rule pt-4 ${className}`}>
      <h3 className="mb-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * This team's chance before a played match. Coloured like the bracket only when the model picked
 * this team: muted green ✓ if it won, muted red and crossed out if it lost.
 */
function ModelChance({ p, won }: { p: number | undefined; won: boolean }) {
  if (p === undefined) return <span className="text-ink-3">–</span>
  const verdict = chanceVerdict(p, won)
  // The mark sits in a fixed slot, so the digits line up whether or not a row has one.
  const mark = (text: string) => <span className="inline-block w-4 text-right">{text}</span>
  if (verdict === undefined)
    return (
      <span className="text-ink-2">
        {pct(p)}
        {mark('')}
      </span>
    )
  return verdict === 'hit' ? (
    <span className="font-semibold text-win">
      {pct(p)}
      {mark('✓')}
    </span>
  ) : (
    <span className="font-semibold text-loss-muted">
      <span className="line-through">{pct(p)}</span>
      {mark('✗')}
    </span>
  )
}
