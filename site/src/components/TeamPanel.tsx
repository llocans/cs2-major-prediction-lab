import type { MatchPrediction, TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { forms, ratings } from '../lib/data.ts'
import { pct, shortDate } from '../lib/format.ts'
import type { TeamMatchRow } from '../lib/market.ts'

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
  name: (teamId: string) => string
  swapOptions: string[]
  canSwap: boolean
  swappedWith?: string
  onSwap: (other: string | undefined) => void
}

export function TeamPanel(props: Props) {
  const { teamId, seed, outlook, next, nextMarket, matches = [], name } = props
  const { swapOptions, canSwap, swappedWith, onSwap } = props
  const played = matches.filter((m) => m.result !== undefined)
  const form = forms.get(teamId)
  const rating = ratings.teams[teamId]
  const opponent = next ? (next.teamA === teamId ? next.teamB : next.teamA) : undefined
  const pNext = next ? (next.teamA === teamId ? next.pA : 1 - next.pA) : undefined

  return (
    <aside className="flex flex-col gap-4" aria-label={`${name(teamId)} details`}>
      <header className="border-b border-ink pb-2">
        <div className="font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
          Seed {seed ?? '–'}
          {form && ` · VRS #${form.vrs.rank} · ${form.vrs.points} pts`}
        </div>
        <h2 className="font-display text-3xl font-bold leading-tight">{name(teamId)}</h2>
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
        <section>
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
            Next
          </h3>
          <p className="text-sm">
            vs {name(opponent)} · {next.format.toUpperCase()} · {next.confidence} confidence
          </p>
          <dl className="mt-1 grid grid-cols-3 gap-2">
            <div>
              <dt className="font-display text-xs uppercase tracking-wider text-ink-3">Model</dt>
              <dd className="num font-display text-2xl font-semibold text-accent">{pct(pNext)}</dd>
            </div>
            <div>
              <dt
                className="font-display text-xs uppercase tracking-wider text-ink-3"
                title="Betting odds without the bookmaker margin"
              >
                Market
              </dt>
              <dd className="num font-display text-2xl font-semibold text-accent" data-keep-accent>
                {nextMarket === undefined ? '–' : pct(nextMarket)}
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-sm text-ink-2">{next.reason}</p>
        </section>
      )}

      {played.length > 0 && (
        <section>
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
            This stage
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-3">
                <th className="text-left font-normal">Round</th>
                <th className="text-right font-normal">Model</th>
                <th className="text-right font-normal">Market</th>
                <th className="w-6 text-right font-normal" />
              </tr>
            </thead>
            <tbody>
              {played.map((m) => (
                <tr key={m.round} className="num">
                  <td className="truncate text-ink-2">
                    R{m.round} vs {name(m.opponent)}
                  </td>
                  <td className="text-right font-semibold text-accent">
                    {m.model === undefined ? '–' : pct(m.model)}
                  </td>
                  <td className="text-right font-semibold text-accent" data-keep-accent>
                    {m.market === undefined ? '–' : pct(m.market)}
                  </td>
                  <td className={`text-right ${m.result === 'W' ? 'text-win' : 'text-loss'}`}>
                    {m.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-ink-3">
            Model: our chance before the round. Market: betting odds without the bookmaker margin.
          </p>
        </section>
      )}

      {outlook && (
        <section>
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
            Why
          </h3>
          <p className="text-sm text-ink-2">{outlook.reason}</p>
        </section>
      )}

      {form && (
        <section>
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
            Form (VRS, to {shortDate(form.asOf)})
          </h3>
          <p className="num text-sm">
            90 days {form.summary.last90Days.won}-{form.summary.last90Days.lost} · vs top 30{' '}
            {form.summary.vsTop30.won}-{form.summary.vsTop30.lost}
          </p>
          <ol className="mt-1 text-sm">
            {form.recent.slice(0, 6).map((series) => (
              <li key={`${series.date}-${series.opponent}`} className="num flex gap-2 text-ink-2">
                <span className="w-12 text-ink-3">{shortDate(series.date)}</span>
                <span className={series.result === 'W' ? 'w-3 text-win' : 'w-3 text-loss'}>
                  {series.result}
                </span>
                <span className="truncate">
                  {series.opponent}
                  {series.opponentRank && (
                    <span className="text-ink-3"> #{series.opponentRank}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-1 text-xs text-ink-3">Lineup: {form.roster.join(', ')}</p>
        </section>
      )}

      <section>
        <label
          className="font-display text-xs font-semibold uppercase tracking-wider text-ink-3"
          htmlFor="swap"
        >
          What if: swap seed with
        </label>
        <select
          id="swap"
          className="mt-1 w-full rounded-sm border border-rule bg-paper px-2 py-1 text-sm disabled:text-ink-3"
          value={swappedWith ?? ''}
          disabled={!canSwap}
          onChange={(event) => onSwap(event.target.value || undefined)}
        >
          <option value="">{canSwap ? 'No swap' : 'Only before the stage starts'}</option>
          {swapOptions.map((other) => (
            <option key={other} value={other}>
              {name(other)}
            </option>
          ))}
        </select>
      </section>
    </aside>
  )
}
