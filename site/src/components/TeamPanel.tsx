import type { MatchPrediction, TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { forms, ratings } from '../lib/data.ts'
import { pct, shortDate } from '../lib/format.ts'

interface Props {
  teamId: string
  /** Seed in the stage being shown (entry or advanced seed). */
  seed?: number
  outlook?: TeamOutlook
  next?: MatchPrediction
  name: (teamId: string) => string
  swapOptions: string[]
  canSwap: boolean
  swappedWith?: string
  onSwap: (other: string | undefined) => void
}

export function TeamPanel(props: Props) {
  const { teamId, seed, outlook, next, name, swapOptions, canSwap, swappedWith, onSwap } = props
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
            <span className="num font-semibold text-accent">{pct(pNext)}</span> vs {name(opponent)}{' '}
            · {next.format.toUpperCase()} · {next.confidence} confidence
          </p>
          <p className="mt-1 text-sm text-ink-2">{next.reason}</p>
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
