import type { ReactNode } from 'react'
import type { MatchPrediction, TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { forms, ratings } from '../lib/data.ts'
import { pct, shortDate } from '../lib/format.ts'
import type { TeamMatchRow } from '../lib/market.ts'
import { chanceVerdict } from '../lib/verdict.ts'
import { TeamLogo } from './TeamLogo.tsx'

interface Props {
  teamId: string
  /** Seed in the stage being shown (entry or advanced seed). */
  seed?: number
  outlook?: TeamOutlook
  next?: MatchPrediction
  /** The market's chance for this team in its next match, if logged. */
  nextMarket?: number
  /** This team's matches in the stage so far. */
  matches?: TeamMatchRow[]
  /** The team's name at this event, for the heading. */
  name: string
  /** Short name (e.g. "NIP") for running text. */
  short: (teamId: string) => string
  /** Short name for an opponent as written in Valve's VRS tables, if we know the team. */
  shortFromVrs: (vrsName: string) => string
}

export function TeamPanel(props: Props) {
  const { teamId, seed, outlook, next, nextMarket, matches = [], name, short } = props
  const played = matches.filter((m) => m.result !== undefined)
  const form = forms.get(teamId)
  const rating = ratings.teams[teamId]
  const opponent = next ? (next.teamA === teamId ? next.teamB : next.teamA) : undefined
  const pNext = next ? (next.teamA === teamId ? next.pA : 1 - next.pA) : undefined

  return (
    <aside className="flex flex-col gap-6" aria-label={`${name} details`}>
      <header className="border-b border-ink pb-3">
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
            Rating {Math.round(rating.rating)} ± {Math.round(rating.rd)}
            {rating.rd >= 100 && <span className="text-ink-3"> · little tier-1 data</span>}
          </div>
        )}
      </header>

      {outlook && (
        <dl className="grid grid-cols-3 gap-2">
          {(
            [
              ['3-0', outlook.p30],
              ['Advance', outlook.pAdvance],
              ['0-3', outlook.p03],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="font-display text-xs uppercase tracking-wider text-ink-3">{label}</dt>
              <dd className="num font-display text-2xl font-semibold text-accent">{pct(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {next && opponent && pNext !== undefined && (
        <Section title={`Next · vs ${short(opponent)} · ${next.format.toUpperCase()}`}>
          <dl className="grid grid-cols-3 gap-2">
            <div>
              <dt className="text-xs text-ink-3">Model</dt>
              <dd className="num font-display text-2xl font-semibold text-accent">{pct(pNext)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3" title="Betting odds without the bookmaker margin">
                Market
              </dt>
              <dd className="num font-display text-2xl font-semibold text-accent" data-keep-accent>
                {nextMarket === undefined ? '–' : pct(nextMarket)}
              </dd>
            </div>
          </dl>
          {next.confidence === 'low' && (
            <p className="mt-1 text-xs text-ink-3">Low confidence: little recent data</p>
          )}
        </Section>
      )}

      {played.length > 0 && (
        <Section title="This stage">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-3">
                <th className="w-8 pb-1 text-left font-normal">Rd</th>
                <th className="w-6 pb-1 text-left font-normal" />
                <th className="pb-1 text-left font-normal">Opponent</th>
                <th className="pb-1 text-right font-normal">Model</th>
                <th
                  className="pb-1 text-right font-normal"
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
                    {m.market === undefined ? '–' : pct(m.market)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-xs text-ink-3">Chances before the match.</p>
        </Section>
      )}

      {form && (
        <Section title={`Form · VRS to ${shortDate(form.asOf)}`}>
          <p className="num text-sm">
            90 days {form.summary.last90Days.won}-{form.summary.last90Days.lost}
            <span className="text-ink-3"> · </span>
            vs top 30 {form.summary.vsTop30.won}-{form.summary.vsTop30.lost}
          </p>
          <ol className="mt-2 flex flex-col gap-0.5 text-sm">
            {form.recent.slice(0, 6).map((series) => (
              <li key={`${series.date}-${series.opponent}`} className="num flex gap-3 text-ink-2">
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * This team's chance before a played match. Coloured like the bracket only when the model picked
 * this team: green ✓ if it won, red and crossed out if it lost; plain under the coin-flip line.
 */
function ModelChance({ p, won }: { p: number | undefined; won: boolean }) {
  if (p === undefined) return <span className="text-ink-3">–</span>
  const verdict = chanceVerdict(p, won)
  if (verdict === undefined || verdict === 'coin-flip')
    return <span className="text-ink-2">{pct(p)}</span>
  return verdict === 'hit' ? (
    <span className="font-semibold text-win">{pct(p)} ✓</span>
  ) : (
    <span className="font-semibold text-loss">
      <span className="line-through">{pct(p)}</span> ✗
    </span>
  )
}
