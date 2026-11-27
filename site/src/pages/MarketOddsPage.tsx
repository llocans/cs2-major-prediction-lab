import type { ReactNode } from 'react'
import type { MarketRule } from '../../../data/schemas/event-config.ts'
import {
  type MarketMatch,
  type MarketRound,
  type SkipReason,
  stageMarketPicks,
  type Tally,
} from '../../../engine/market-picks.ts'
import { Page, PageHeader } from '../components/Page.tsx'
import { TeamLogo } from '../components/TeamLogo.tsx'
import { type EventData, teamName, teamShortName } from '../lib/data.ts'
import { pct, shortDate } from '../lib/format.ts'
import { displayOdds, sourceLabel } from '../lib/market.ts'
import { type RoundSlips, roundSlips, type SlipView, stageSlipRecord } from '../lib/slips.ts'

const SKIP_LABEL: Record<SkipReason, string> = {
  'no-odds': 'no odds',
  'small-edge': 'small edge',
  'little-data': 'little data',
}

const CONFIDENCE_ORDER: Record<MarketMatch['confidence'], number> = { high: 0, medium: 1, low: 2 }
const CONFIDENCE_LABEL: Record<MarketMatch['confidence'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** Most confident matches first, then the biggest gap between model and market. */
function byConfidence(a: MarketMatch, b: MarketMatch): number {
  return (
    CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] ||
    (b.edge?.value ?? -1) - (a.edge?.value ?? -1)
  )
}

/** "+8 pp": a probability difference in percentage points. */
const points = (value: number) => `+${Math.round(value * 100)} pp`

/** "+6.1" or "−1.0": profit in units, always signed. */
const unitsText = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`

/** The model's picks against the market's margin-free prices, stage by stage, round by round. */
export function MarketOddsPage({ event, stageId }: { event: EventData; stageId?: string }) {
  const stages = event.config.stages
  // Pre-match odds where they were read before the round, the closing line for the rest.
  const odds = displayOdds(event.bookmakerOdds, event.benchmarks)
  // Each stage keeps its own rule (event config `marketRule`), so a later change never rewrites
  // an earlier stage's record. A stage without a rule has no picks (validate requires one once it
  // has odds).
  const records = stages.flatMap((s) =>
    s.marketRule
      ? [stageMarketPicks(s.id, s.marketRule, event.snapshots, odds, event.results.matches)]
      : [],
  )
  const latestWithOdds = [...records].reverse().find((r) => r.rounds.length > 0)
  const record = records.find((r) => r.stageId === stageId) ?? latestWithOdds ?? records[0]
  // Short names on narrow screens (design.md: short names in tight spots).
  const name = (id: string) => (
    <>
      <span className="sm:hidden">{teamShortName(event, id)}</span>
      <span className="hidden sm:inline">{teamName(event, id)}</span>
    </>
  )

  return (
    <Page>
      <PageHeader title="Market odds" subtitle="The model against the betting market." />

      <nav className="flex flex-wrap gap-x-5 gap-y-1 border-b border-rule pb-2">
        {stages.map((s) => (
          <a
            key={s.id}
            href={`#/market/${s.id}`}
            className={`font-display text-lg font-semibold ${s.id === record?.stageId ? 'text-ink underline decoration-accent decoration-2 underline-offset-4' : 'text-ink-3 hover:text-ink'}`}
          >
            {s.name}
          </a>
        ))}
      </nav>

      {!record || record.rounds.length === 0 ? (
        <p className="text-sm text-ink-3">No odds logged for this stage yet.</p>
      ) : (
        <>
          {record.rule.note && (
            <p className="max-w-2xl text-sm font-semibold text-ink">{record.rule.note}</p>
          )}
          <p className="max-w-2xl text-sm text-ink-2">
            A value pick is the team the model gives at least{' '}
            {Math.round(record.rule.minEdge * 100)} points more than the market. It can be the
            underdog: it is picked for the price, not because it is expected to win. Units is the
            profit from 1 unit on every pick at the market's margin-free odds.
          </p>
          <dl className="num flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Stat label="Picks" value={record.picks} />
            <Stat label="Won" value={record.won} />
            <Stat label="Lost" value={record.lost} />
            <Stat label="To play" value={record.pending} />
            {record.won + record.lost > 0 && <Stat label="Units" value={unitsText(record.units)} />}
          </dl>
          <SlipRecord
            record={stageSlipRecord(
              event,
              record.stageId,
              record.rounds.map((r) => r.round),
            )}
          />
          <div className="flex max-w-4xl flex-col gap-3">
            {[...record.rounds].reverse().map((round, i) => (
              <RoundSection
                key={round.round}
                round={round}
                rule={record.rule}
                slips={roundSlips(event, record.stageId, round.round)}
                open={i === 0}
                name={name}
              />
            ))}
          </div>
        </>
      )}
    </Page>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="font-display text-xs uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}

function tallyText(t: Tally): string {
  if (t.picks === 0) return 'no picks'
  const parts = [`${t.picks} ${t.picks === 1 ? 'pick' : 'picks'}`]
  if (t.won + t.lost > 0) parts.push(`${t.won} won`, `${t.lost} lost`)
  if (t.pending > 0 && t.won + t.lost > 0) parts.push(`${t.pending} to play`)
  if (t.won + t.lost > 0) parts.push(`${unitsText(t.units)} units`)
  return parts.join(' · ')
}

function RoundSection(props: {
  round: MarketRound
  rule: MarketRule
  slips: RoundSlips | undefined
  open: boolean
  name: (id: string) => ReactNode
}) {
  const { round, rule, slips, open, name } = props
  return (
    <details open={open} className="border-b border-rule pb-2">
      <summary className="cursor-pointer py-1">
        <span className="font-display text-lg font-bold">Round {round.round}</span>
        <span className="num ml-3 text-xs text-ink-3">
          {tallyText(round)}
          {round.sources.length > 0 && ` · ${round.sources.map(sourceLabel).join(' + ')}`}
          {round.readOn && `, read ${shortDate(round.readOn)}`}
        </span>
      </summary>
      <div className="mt-2 overflow-x-auto">
        {/* Fixed column widths on wider screens, so the columns line up from round to round. */}
        <table className="w-full text-sm sm:table-fixed">
          <colgroup>
            <col className="sm:w-[31%]" />
            <col className="sm:w-[10%]" />
            <col className="sm:w-[10%]" />
            <col className="sm:w-[15%]" />
            <col className="sm:w-[24%]" />
            <col className="sm:w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-ink text-left font-display text-xs uppercase tracking-wider text-ink-2">
              <th className="py-1 pr-1.5 font-semibold sm:pr-2">Match</th>
              <th className="py-1 pr-2.5 text-right font-semibold sm:pr-2">Model</th>
              <th
                className="py-1 pr-2.5 text-right font-semibold sm:pr-2"
                title="The market's chance for each team with the margin removed (the two add up to 100%). The model never uses it."
              >
                Market
              </th>
              <th
                className="py-1 pr-1.5 pl-2 font-semibold sm:pr-2 sm:pl-6"
                title="How sure the model is: high needs solid data on both teams and a clear favourite"
              >
                <span className="sm:hidden">Conf.</span>
                <span className="hidden sm:inline">Confidence</span>
              </th>
              <th
                className="py-1 pr-1.5 font-semibold sm:pr-2"
                title={`The team the model gives at least ${Math.round(rule.minEdge * 100)} points more than the market, picked for the price (it can be the underdog).${rule.skipLittleData ? ' Matches with little tier-1 data on a team are skipped.' : ''}`}
              >
                <span className="sm:hidden">Pick</span>
                <span className="hidden sm:inline">Value pick</span>
              </th>
              <th className="py-1 text-right font-semibold">Result</th>
            </tr>
          </thead>
          {[...round.matches].sort(byConfidence).map((match) => (
            <MatchRows key={`${match.teamA}-${match.teamB}`} match={match} name={name} />
          ))}
        </table>
      </div>
      {slips && <SlipsBlock slips={slips} name={name} />}
    </details>
  )
}

function MatchRows({ match, name }: { match: MarketMatch; name: (id: string) => ReactNode }) {
  const sides = [
    { team: match.teamA, model: match.modelA, market: match.marketA },
    {
      team: match.teamB,
      model: 1 - match.modelA,
      market: match.marketA === undefined ? undefined : 1 - match.marketA,
    },
  ]
  return (
    <tbody className="border-b border-rule" title={match.reason}>
      {sides.map((side, i) => (
        <tr key={side.team}>
          <td className={`whitespace-nowrap pr-2.5 sm:pr-2 ${i === 0 ? 'pt-1.5' : 'pb-1.5'}`}>
            <TeamLogo teamId={side.team} className="mr-2 align-middle" />
            <span className={match.result?.winner === side.team ? 'font-semibold' : ''}>
              {name(side.team)}
            </span>
            {i === 0 && (
              <span className="ml-1.5 hidden text-xs uppercase text-ink-3 sm:inline">
                {match.format}
              </span>
            )}
          </td>
          <td
            className={`num pr-2.5 text-right text-accent sm:pr-2 ${i === 0 ? 'pt-1.5' : 'pb-1.5'}`}
          >
            {pct(side.model)}
          </td>
          <td
            className={`num pr-2.5 text-right text-ink-2 sm:pr-2 ${i === 0 ? 'pt-1.5' : 'pb-1.5'}`}
          >
            {side.market === undefined ? '–' : pct(side.market)}
          </td>
          {i === 0 && (
            <>
              <td rowSpan={2} className="py-1.5 pr-1.5 pl-2 align-middle sm:pr-2 sm:pl-6">
                <ConfidenceCell confidence={match.confidence} />
              </td>
              <td rowSpan={2} className="py-1.5 pr-1.5 align-middle sm:pr-2">
                <PickCell match={match} name={name} />
              </td>
              <td rowSpan={2} className="num whitespace-nowrap py-1.5 text-right align-middle">
                {match.result ? (
                  match.result.score
                ) : (
                  <span className="whitespace-nowrap text-ink-3" title="To play">
                    <span className="sm:hidden">–</span>
                    <span className="hidden sm:inline">to play</span>
                  </span>
                )}
              </td>
            </>
          )}
        </tr>
      ))}
    </tbody>
  )
}

function PickCell({ match, name }: { match: MarketMatch; name: (id: string) => ReactNode }) {
  if (match.pick === undefined) {
    return (
      <span className="text-xs text-ink-3">
        skip · {SKIP_LABEL[match.skip ?? 'no-odds']}
        {match.skip === 'small-edge' && match.edge && (
          <span className="whitespace-nowrap"> {points(match.edge.value)}</span>
        )}
      </span>
    )
  }
  // The space lets a narrow column put the edge on its own line.
  const edge = match.edge ? (
    <>
      {' '}
      <span className="num whitespace-nowrap text-xs text-ink-3">{points(match.edge.value)}</span>
    </>
  ) : null
  if (match.pickWon === undefined) {
    return (
      <span>
        <span className="text-accent">{name(match.pick)}</span>
        {edge}
      </span>
    )
  }
  return (
    <span>
      <span className={match.pickWon ? 'text-win' : 'text-loss line-through'}>
        {name(match.pick)} {match.pickWon ? '✓' : '✗'}
      </span>
      {edge}
    </span>
  )
}

/** High stands out in ink and bold, medium in plain ink, low muted. */
function ConfidenceCell({ confidence }: { confidence: MarketMatch['confidence'] }) {
  const style =
    confidence === 'high'
      ? 'font-semibold text-ink'
      : confidence === 'medium'
        ? 'text-ink-2'
        : 'text-ink-3'
  return (
    <span className={`font-display text-sm uppercase tracking-wider ${style}`}>
      <span className="sm:hidden">{CONFIDENCE_LABEL[confidence].slice(0, 3)}</span>
      <span className="hidden sm:inline">{CONFIDENCE_LABEL[confidence]}</span>
    </span>
  )
}

const SLIP_LABEL: Record<SlipView['kind'], string> = {
  safer: 'Safer slip',
  riskier: 'Riskier slip',
  extra: 'Extra slip',
}

const SLIP_TITLE: Record<SlipView['kind'], string> = {
  safer: 'Value picks the model expects to win (High or Medium confidence), combined',
  riskier: 'Value picks with less chance but a better price: underdogs and Low confidence picks',
  extra: 'Value picks left over after the first two slips',
}

/** The stage's slip record by kind, when it has slips. */
function SlipRecord({
  record,
}: {
  record: Map<SlipView['kind'], { slips: number; won: number; lost: number; units: number }>
}) {
  if (record.size === 0) return null
  return (
    <p className="num flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-2">
      {(['safer', 'riskier', 'extra'] as const).map((kind) => {
        const t = record.get(kind)
        if (!t) return null
        const decided = t.won + t.lost
        return (
          <span key={kind}>
            <span className="font-semibold text-ink">{SLIP_LABEL[kind]}s</span> {t.slips}
            {decided > 0 && ` · ${t.won} won · ${t.lost} lost · ${unitsText(t.units)} units`}
          </span>
        )
      })}
    </p>
  )
}

/** A round's bet slips: picks, the model's chance that all win, combined odds and the result. */
function SlipsBlock({ slips, name }: { slips: RoundSlips; name: (id: string) => ReactNode }) {
  return (
    <div className="mt-3">
      <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-ink-2">
        Bet slips
      </h4>
      {slips.noSlip ? (
        <p className="mt-1 text-sm text-ink-3">No slip this round: {slips.noSlip}.</p>
      ) : (
        <ul className="mt-1 max-w-3xl">
          {slips.slips.map((slip) => (
            <li
              key={`${slip.kind}-${slip.legs.map((l) => l.pick).join('-')}`}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-b border-rule py-1.5 text-sm"
            >
              <span className="w-full shrink-0 font-semibold sm:w-28" title={SLIP_TITLE[slip.kind]}>
                {SLIP_LABEL[slip.kind]}
                {slip.legs.length === 1 && (
                  <span className="ml-1 text-xs font-normal text-ink-3">single</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                {slip.legs.map((leg, i) => {
                  const winner = slip.winners[i]
                  const style =
                    winner === undefined
                      ? 'text-accent'
                      : winner === leg.pick
                        ? 'text-win'
                        : 'text-loss line-through'
                  return (
                    <span key={leg.pick}>
                      {i > 0 && <span className="text-ink-3"> + </span>}
                      <span className={style}>{name(leg.pick)}</span>
                    </span>
                  )
                })}
              </span>
              <span
                className="num whitespace-nowrap text-ink-2"
                title="The model's chance that every pick wins"
              >
                all win {pct(slip.outcome.chanceAll)}
              </span>
              {slip.outcome.odds !== undefined && (
                <span
                  className="num whitespace-nowrap text-ink-2"
                  title="Combined odds: the picks' odds multiplied"
                >
                  odds {slip.outcome.odds.toFixed(2)}
                </span>
              )}
              <span className="num ml-auto whitespace-nowrap">
                {slip.outcome.status === 'pending' ? (
                  <span className="text-ink-3">to play</span>
                ) : (
                  <span className={slip.outcome.status === 'won' ? 'text-win' : 'text-loss'}>
                    {slip.outcome.status === 'won' ? 'won' : 'lost'}
                    {slip.outcome.units !== undefined && ` ${unitsText(slip.outcome.units)}`}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-ink-3">
        {slips.odds === 'real'
          ? 'Odds as the bookmaker listed them (shown on this computer only).'
          : 'Odds with the margin removed; real payouts are a little lower.'}
      </p>
    </div>
  )
}
