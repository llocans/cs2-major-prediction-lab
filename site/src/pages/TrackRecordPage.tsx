import type { ReactNode } from 'react'
import type { MatchPrediction } from '../../../data/schemas/snapshot.ts'
import { stageSeeds } from '../../../engine/swiss/stage-seeds.ts'
import { swissStandings } from '../../../engine/swiss/standings.ts'
import {
  type RoundRecord,
  type StageTrackRecord,
  stageTrackRecord,
  type TrackedMatch,
  UPSET_BELOW,
} from '../../../engine/track-record.ts'
import { TeamLogo } from '../components/TeamLogo.tsx'
import { type EventData, teamName, teamShortName } from '../lib/data.ts'
import { pct, shortDate } from '../lib/format.ts'

/** Predictions saved before each round vs what happened. Same scoring as scripts/score-stage.ts. */
export function TrackRecordPage({ event }: { event: EventData }) {
  // Short names on narrow screens (design.md: short names in tight spots).
  const name = (id: string): ReactNode => (
    <>
      <span className="sm:hidden">{teamShortName(event, id)}</span>
      <span className="hidden sm:inline">{teamName(event, id)}</span>
    </>
  )
  const stages = event.config.stages.flatMap((stage) => {
    if (!event.snapshots.some((s) => s.stageId === stage.id)) return []
    // Advance odds are a Swiss measure; playoff stages are scored on their matches only.
    const seeds = stageSeeds(event.teams.participants, stage.id)
    const standings =
      stage.type === 'swiss' && seeds.length === stage.teamCount
        ? swissStandings(
            seeds,
            event.results.matches.filter((m) => m.stageId === stage.id),
            stage,
          )
        : []
    const complete = standings.length > 0 && standings.every((s) => s.status !== 'active')
    const advanced = complete
      ? new Set(standings.filter((s) => s.status === 'advanced').map((s) => s.teamId))
      : undefined
    return [
      {
        stage,
        record: stageTrackRecord(
          stage.id,
          event.snapshots,
          event.results.matches,
          event.benchmarks,
          advanced,
        ),
      },
    ]
  })

  return (
    <div className="flex flex-col gap-10">
      <header className="flex max-w-prose flex-col gap-2">
        <h1 className="font-display text-5xl font-bold leading-none tracking-tight">
          Track record
        </h1>
        <p className="text-sm text-ink-2">
          Every prediction is saved before its round starts and never edited. Here it is next to
          what happened. The Brier score is the average squared error of our probabilities: 0 is
          perfect, 0.250 is what always saying 50% would score, so lower than 0.250 means the model
          added something.
        </p>
      </header>
      {stages.length === 0 && <p className="text-sm text-ink-3">No predictions saved yet.</p>}
      {stages.map(({ stage, record }) => (
        <StageSection key={stage.id} title={stage.name} record={record} name={name} />
      ))}
    </div>
  )
}

function StageSection(props: {
  title: string
  record: StageTrackRecord
  name: (id: string) => ReactNode
}) {
  const { title, record, name } = props
  const scored = record.rounds.reduce((sum, r) => sum + r.matches.length, 0)
  const hits = record.rounds.reduce((sum, r) => sum + r.hits, 0)

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 border-b border-ink pb-2">
        <h2 className="font-display text-3xl font-bold">{title}</h2>
        <dl className="num flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Stat label="Scored" value={`${scored} matches`} />
          <Stat
            label="Favourite won"
            value={scored ? `${hits} of ${scored} (${pct(record.hitRate ?? 0)})` : '–'}
          />
          <Stat
            label="Brier"
            value={record.brier === undefined ? '–' : record.brier.toFixed(3)}
            note="coin flip 0.250"
          />
          {record.market && (
            <Stat
              label="Vs market"
              value={`${record.market.model.toFixed(3)} vs ${record.market.market.toFixed(3)}`}
              note={`${record.market.matches} matches`}
            />
          )}
          <Stat label="Still to play" value={String(record.pending)} />
        </dl>
      </div>

      {record.rounds.map((round) => (
        <RoundTable key={round.round} round={round} name={name} />
      ))}

      {record.calibration.length > 0 && (
        <div>
          <h3 className="mb-1 font-display text-lg font-bold">Calibration</h3>
          <p className="mb-2 text-xs text-ink-3">
            When we said a team had a given chance, how often did it win? Close numbers mean honest
            probabilities. Small groups say little.
          </p>
          <table className="num text-sm">
            <thead>
              <tr className="border-b border-ink text-left font-display text-xs uppercase tracking-wider text-ink-2">
                <th className="py-1 pr-4 font-semibold">We said</th>
                <th className="py-1 pr-4 text-right font-semibold">Matches</th>
                <th className="py-1 pr-4 text-right font-semibold">Average</th>
                <th className="py-1 text-right font-semibold">Happened</th>
              </tr>
            </thead>
            <tbody>
              {record.calibration.map((bin) => (
                <tr key={bin.from} className="border-b border-rule">
                  <td className="py-1 pr-4">
                    {pct(bin.from)}–{pct(bin.to)}
                  </td>
                  <td className="py-1 pr-4 text-right">{bin.count}</td>
                  <td className="py-1 pr-4 text-right text-accent">{pct(bin.predicted)}</td>
                  <td className="py-1 text-right">{pct(bin.observed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {record.advance && (
        <div>
          <h3 className="mb-2 font-display text-lg font-bold">
            Advance odds before the stage{' '}
            <span className="num text-sm font-normal text-ink-2">
              Brier {record.advance.brier.toFixed(3)}
            </span>
          </h3>
          <ul className="num grid gap-x-6 text-sm sm:grid-cols-2">
            {record.advance.teams.map((team) => (
              <li key={team.teamId} className="flex justify-between border-b border-rule py-1">
                <span className="flex items-center gap-2">
                  <TeamLogo teamId={team.teamId} />
                  {name(team.teamId)}
                </span>
                <span>
                  <span className="text-accent">{pct(team.p)}</span>{' '}
                  <span className={team.advanced ? 'text-win' : 'text-loss'}>
                    {team.advanced ? 'advanced' : 'out'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="font-display text-xs uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="font-semibold">
        {value}
        {note && <span className="ml-1 font-normal text-ink-3">{note}</span>}
      </dd>
    </div>
  )
}

function RoundTable({ round, name }: { round: RoundRecord; name: (id: string) => ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 flex items-baseline gap-3 font-display text-lg font-bold">
        Round {round.round}
        <span className="num text-xs font-normal text-ink-3">
          saved {shortDate(round.savedAt)}
          {round.matches.length > 0 &&
            ` · favourite won ${round.hits} of ${round.matches.length} · Brier ${round.brier?.toFixed(3)}`}
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink text-left font-display text-xs uppercase tracking-wider text-ink-2">
              <th className="py-1 pr-2 font-semibold">Match</th>
              <th className="py-1 pr-2 text-right font-semibold">We said</th>
              <th className="py-1 pr-2 font-semibold">Winner</th>
              <th className="py-1 pr-2 font-semibold">Verdict</th>
              <th className="hidden py-1 text-right font-semibold sm:table-cell">Brier</th>
            </tr>
          </thead>
          <tbody>
            {round.matches.map((match) => (
              <PlayedRow key={`${match.teamA}-${match.teamB}`} match={match} name={name} />
            ))}
            {round.pendingMatches.map((match) => (
              <PendingRow key={`${match.teamA}-${match.teamB}`} match={match} name={name} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** "Team 63%": the side we favoured and its probability. */
function favourite(
  match: { teamA: string; teamB: string; pA: number },
  name: (id: string) => ReactNode,
) {
  const aFavoured = match.pA >= 0.5
  return (
    <>
      {name(aFavoured ? match.teamA : match.teamB)} {pct(aFavoured ? match.pA : 1 - match.pA)}
    </>
  )
}

function PlayedRow({ match, name }: { match: TrackedMatch; name: (id: string) => ReactNode }) {
  const verdict = match.upset ? 'Upset' : match.hit ? 'Hit' : 'Miss'
  return (
    <tr className="border-b border-rule" title={match.reason}>
      <td className="py-1.5 pr-2">
        {name(match.teamA)} <span className="text-ink-3">v</span> {name(match.teamB)}{' '}
        <span className="hidden text-xs uppercase text-ink-3 sm:inline">{match.format}</span>
      </td>
      <td className="num py-1.5 pr-2 text-right text-accent">{favourite(match, name)}</td>
      <td className="py-1.5 pr-2 font-semibold">{name(match.winner)}</td>
      <td className={`py-1.5 pr-2 ${match.hit ? 'text-win' : 'text-loss'}`}>
        {verdict}
        {match.upset && (
          <span className="num ml-1 hidden text-xs text-ink-3 sm:inline">
            winner had {pct(match.pWinner)} (under {pct(UPSET_BELOW)})
          </span>
        )}
      </td>
      <td className="num hidden py-1.5 text-right text-ink-2 sm:table-cell">
        {match.brier.toFixed(3)}
      </td>
    </tr>
  )
}

function PendingRow({ match, name }: { match: MatchPrediction; name: (id: string) => ReactNode }) {
  return (
    <tr className="border-b border-rule text-ink-2" title={match.reason}>
      <td className="py-1.5 pr-2">
        {name(match.teamA)} <span className="text-ink-3">v</span> {name(match.teamB)}{' '}
        <span className="hidden text-xs uppercase text-ink-3 sm:inline">{match.format}</span>
      </td>
      <td className="num py-1.5 pr-2 text-right text-accent">{favourite(match, name)}</td>
      <td className="py-1.5 pr-2 text-ink-3" colSpan={3}>
        not played yet
      </td>
    </tr>
  )
}
