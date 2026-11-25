import { useMemo } from 'react'
import type { SwissStage } from '../../../data/schemas/event-config.ts'
import { buildEventChain } from '../../../engine/event-chain.ts'
import { type KnownMatch, swissBracket } from '../../../engine/swiss/bracket.ts'
import { swissMatchFormat } from '../../../engine/swiss/format.ts'
import { stageSeeds } from '../../../engine/swiss/stage-seeds.ts'
import { FreshnessBar } from '../components/FreshnessBar.tsx'
import { OddsTable } from '../components/OddsTable.tsx'
import { SimStatus } from '../components/SimStatus.tsx'
import { SwissBracket } from '../components/SwissBracket.tsx'
import { TeamPanel } from '../components/TeamPanel.tsx'
import {
  type EventData,
  ratings,
  registry,
  syncStatus,
  teamName,
  teamShortName,
} from '../lib/data.ts'
import { shortDate } from '../lib/format.ts'
import { marketQuote, teamStageMatches } from '../lib/market.ts'
import { readWhatIf, toggleOverride, writeWhatIf } from '../lib/overrides.ts'
import { setQuery } from '../lib/router.ts'
import { stagePicks } from '../lib/verdict.ts'
import { modelRequest } from '../sim/requests.ts'
import { useStageSimulation } from '../sim/useSimulation.ts'

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

interface Props {
  event: EventData
  stage: SwissStage
  query: URLSearchParams
}

export function StagePage({ event, stage, query }: Props) {
  const whatIf = readWhatIf(query)
  const name = (id: string) => teamName(event, id)
  const short = (id: string) => teamShortName(event, id)

  const real = event.results.matches.filter((m) => m.stageId === stage.id)

  const seeds = useMemo(
    () => stageSeeds(event.teams.participants, stage.id),
    [event.teams.participants, stage.id],
  )

  const chain = useMemo(
    () => buildEventChain(event.config, event.teams.participants, stage.id),
    [event, stage.id],
  )

  const rules = {
    winsToAdvance: stage.winsToAdvance,
    lossesToEliminate: stage.lossesToEliminate,
    initialPairing: stage.initialPairing,
  }

  const realKeys = new Set(real.map((m) => `${m.round}|${pairKey(m.teamA, m.teamB)}`))
  const known: KnownMatch[] = [
    ...real.map((m) => ({
      round: m.round,
      teamA: m.teamA,
      teamB: m.teamB,
      winner: m.winner,
      kind: 'real' as const,
    })),
    ...whatIf.overrides
      .filter((o) => !realKeys.has(`${o.round}|${pairKey(o.winner, o.loser)}`))
      .map((o) => ({
        round: o.round,
        teamA: o.winner,
        teamB: o.loser,
        winner: o.winner,
        kind: 'override' as const,
      })),
  ]

  let bracketError: string | undefined
  let bracket: ReturnType<typeof swissBracket> = []
  try {
    bracket = swissBracket(seeds, known, rules, stage.format)
  } catch (error) {
    bracketError = error instanceof Error ? error.message : String(error)
  }

  // useSimulation compares requests by value, so a new object per render is fine.
  const request = {
    ...modelRequest(event),
    kind: 'swiss' as const,
    seeds,
    rules,
    format: stage.format,
    played: known.map(({ round, teamA, teamB, winner }) => ({ round, teamA, teamB, winner })),
    chain,
  }
  const sim = useStageSimulation(bracketError ? undefined : request)
  const prediction = sim.prediction

  const pending = new Map((prediction?.matches ?? []).map((m) => [pairKey(m.teamA, m.teamB), m.pA]))
  const scores = new Map(
    real.map((m) => {
      const winsA = m.maps.filter((map) => map.scoreA > map.scoreB).length
      const score =
        m.maps.length === 1
          ? `${m.maps[0]?.scoreA}-${m.maps[0]?.scoreB}`
          : `${winsA}-${m.maps.length - winsA}`
      return [`${m.round}|${pairKey(m.teamA, m.teamB)}`, score]
    }),
  )

  // The model's pick before each finished match, from that round's snapshot (never edited).
  const picks = stagePicks(event.snapshots, event.results.matches, stage.id)

  // Each team's odds before round 1, to show how far they have moved since.
  const firstSnapshot = event.snapshots.find((s) => s.stageId === stage.id && s.beforeRound === 1)
  const start = new Map((firstSnapshot?.teams ?? []).map((t) => [t.teamId, t]))

  // No team is selected until the viewer picks one; picking the selected team again clears it.
  const selected = query.get('team') ?? ''
  const clearSelection = () => {
    const next = new URLSearchParams(query)
    next.delete('team')
    setQuery(next)
  }
  const select = (teamId: string) => {
    if (teamId === selected) {
      clearSelection()
      return
    }
    const next = new URLSearchParams(query)
    next.set('team', teamId)
    setQuery(next)
    // On narrow screens the panel is not beside the bracket or table, so bring it into view.
    // After the hash change has rendered, or the navigation cancels the scroll.
    if (window.matchMedia('(max-width: 1023px)').matches)
      window.setTimeout(() => {
        document
          .getElementById('team-panel')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
  }
  const outlook = prediction?.teams.find((t) => t.teamId === selected)
  const next = prediction?.matches.find((m) => m.teamA === selected || m.teamB === selected)
  const currentRound = prediction?.sim.currentRound
  const nextOpponent = next ? (next.teamA === selected ? next.teamB : next.teamA) : undefined
  const nextMarket =
    nextOpponent && currentRound !== undefined
      ? marketQuote(event, stage.id, currentRound, selected, nextOpponent)
      : undefined

  return (
    <div className="flex flex-col gap-10" data-rough={sim.running || undefined}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-5xl font-bold leading-none tracking-tight">
            {stage.name}
          </h1>
          <p className="num text-sm text-ink-2">
            {shortDate(stage.start)}–{shortDate(stage.end)}
            {currentRound !== undefined && <> · {roundStatus(currentRound, real)}</>}
            <SimStatus running={sim.running} />
          </p>
        </div>
        <FreshnessBar sync={syncStatus} stage={stage} ratingsAsOf={ratings.asOf} />
        <Legend
          overrides={whatIf.overrides.length}
          onReset={() => setQuery(writeWhatIf(query, { overrides: [] }))}
        />
        {(sim.error || bracketError) && (
          <p className="text-sm text-loss" role="alert">
            {bracketError ?? sim.error}
          </p>
        )}
      </header>

      <SwissBracket
        rounds={bracket}
        pending={pending}
        scores={scores}
        picks={picks}
        selected={selected}
        name={name}
        short={short}
        formatFor={(wins, losses) =>
          swissMatchFormat({ wins, losses }, { wins, losses }, rules, stage.format)
        }
        winsToAdvance={stage.winsToAdvance}
        lossesToEliminate={stage.lossesToEliminate}
        market={(round, team, opponent) => marketQuote(event, stage.id, round, team, opponent)}
        onSelect={select}
        onPick={(match, winner) => {
          const loser = winner === match.teamA ? match.teamB : match.teamA
          setQuery(writeWhatIf(query, toggleOverride(whatIf, match.round, winner, loser)))
        }}
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <h2 className="mb-2 font-display text-xl font-bold">Probabilities</h2>
          {prediction ? (
            <OddsTable
              teams={prediction.teams}
              selected={selected}
              name={name}
              short={short}
              start={start}
              onSelect={select}
              unverifiedVeto={prediction.event?.unverifiedVeto}
            />
          ) : (
            <p className="text-sm text-ink-3">Simulating…</p>
          )}
        </section>
        <div
          id="team-panel"
          className="order-first scroll-mt-4 lg:order-none lg:sticky lg:top-6 lg:self-start"
        >
          {selected === '' ? (
            <p className="border-t border-rule pt-3 text-sm text-ink-3">
              Click a team in the bracket or the table to see its details.
            </p>
          ) : (
            <TeamPanel
              teamId={selected}
              seed={seeds.indexOf(selected) + 1 || undefined}
              outlook={outlook}
              next={next}
              nextMarket={nextMarket}
              matches={teamStageMatches(event, stage.id, selected)}
              name={name(selected)}
              short={short}
              shortFromVrs={(vrsName) => shortFromVrs(event, vrsName)}
              onClose={clearSelection}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** "Round 2 next" before a round's first result, "Round 2 in progress" after it, then "Finished". */
function roundStatus(round: number, real: ReadonlyArray<{ round: number }>): string {
  if (round > 5) return 'Finished'
  return real.some((m) => m.round === round) ? `Round ${round} in progress` : `Round ${round} next`
}

function Legend({ overrides, onReset }: { overrides: number; onReset: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-6 text-ink-3">
      <span className="font-semibold uppercase tracking-wider">The bracket:</span>
      <span>
        <span className="font-semibold text-accent">62%</span> model's chance to win
      </span>
      <span>
        <span className="font-semibold text-accent">W*</span> click it to see a what-if win
      </span>
      {overrides > 0 && (
        <button
          type="button"
          className="text-accent underline underline-offset-2"
          onClick={onReset}
        >
          Reset {overrides} override{overrides === 1 ? '' : 's'}
        </button>
      )}
    </p>
  )
}

/** Short name for a team as Valve's VRS tables write it, falling back to that name. */
function shortFromVrs(event: EventData, vrsName: string): string {
  const team = registry.teams.find(
    (t) => t.vrsName === vrsName || t.name === vrsName || t.aliases.some((a) => a.name === vrsName),
  )
  return team ? teamShortName(event, team.id) : vrsName
}
