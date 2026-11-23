import { useMemo } from 'react'
import type { SwissStage } from '../../../data/schemas/event-config.ts'
import { buildEventChain } from '../../../engine/event-chain.ts'
import { type KnownMatch, swissBracket } from '../../../engine/swiss/bracket.ts'
import { stageSeeds } from '../../../engine/swiss/stage-seeds.ts'
import { FreshnessBar } from '../components/FreshnessBar.tsx'
import { OddsTable } from '../components/OddsTable.tsx'
import { SimStatus } from '../components/SimStatus.tsx'
import { SwissBracket } from '../components/SwissBracket.tsx'
import { TeamPanel } from '../components/TeamPanel.tsx'
import { type EventData, params, ratings, syncStatus, teamName } from '../lib/data.ts'
import { shortDate } from '../lib/format.ts'
import { marketChance, teamStageMatches } from '../lib/market.ts'
import { readWhatIf, toggleOverride, writeWhatIf } from '../lib/overrides.ts'
import { setQuery } from '../lib/router.ts'
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

  const real = event.results.matches.filter((m) => m.stageId === stage.id)
  const canSwap = real.length === 0

  const seeds = useMemo(() => {
    const ordered = stageSeeds(event.teams.participants, stage.id)
    const swap = canSwap ? whatIf.swap : undefined
    if (!swap) return ordered
    const [a, b] = swap
    return ordered.map((id) => (id === a ? b : id === b ? a : id))
  }, [event, stage.id, canSwap, whatIf.swap])

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

  const selected = query.get('team') ?? seeds[0] ?? ''
  const select = (teamId: string) => {
    const next = new URLSearchParams(query)
    next.set('team', teamId)
    setQuery(next)
  }
  const outlook = prediction?.teams.find((t) => t.teamId === selected)
  const next = prediction?.matches.find((m) => m.teamA === selected || m.teamB === selected)
  const currentRound = prediction?.sim.currentRound
  const nextOpponent = next ? (next.teamA === selected ? next.teamB : next.teamA) : undefined
  const nextMarket =
    nextOpponent && currentRound !== undefined
      ? marketChance(event, stage.id, currentRound, selected, nextOpponent)
      : undefined

  return (
    <div className="flex flex-col gap-8" data-rough={sim.running || undefined}>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-5xl font-bold leading-none tracking-tight">
          {stage.name}
        </h1>
        <p className="num text-sm text-ink-2">
          Swiss · {stage.teamCount} teams · {shortDate(stage.start)}–{shortDate(stage.end)} ·{' '}
          {currentRound === undefined
            ? '…'
            : currentRound > 5
              ? 'finished'
              : `round ${currentRound} next`}{' '}
          · {params.sim.runs.toLocaleString('en-GB')} runs
          <SimStatus running={sim.running} />
        </p>
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-8">
          <SwissBracket
            rounds={bracket}
            pending={pending}
            scores={scores}
            selected={selected}
            name={name}
            market={(round, team, opponent) => marketChance(event, stage.id, round, team, opponent)}
            onSelect={select}
            onPick={(match, winner) => {
              const loser = winner === match.teamA ? match.teamB : match.teamA
              setQuery(writeWhatIf(query, toggleOverride(whatIf, match.round, winner, loser)))
            }}
          />
          <section>
            <h2 className="mb-2 font-display text-xl font-bold">Probabilities</h2>
            {prediction ? (
              <OddsTable
                teams={prediction.teams}
                selected={selected}
                name={name}
                onSelect={select}
                unverifiedVeto={prediction.event?.unverifiedVeto}
              />
            ) : (
              <p className="text-sm text-ink-3">Simulating…</p>
            )}
          </section>
        </div>
        <div className="lg:sticky lg:top-6 lg:self-start">
          <TeamPanel
            teamId={selected}
            seed={seeds.indexOf(selected) + 1 || undefined}
            outlook={outlook}
            next={next}
            nextMarket={nextMarket}
            matches={teamStageMatches(event, stage.id, selected)}
            name={name}
            swapOptions={seeds.filter((id) => id !== selected)}
            canSwap={canSwap}
            swappedWith={
              whatIf.swap?.includes(selected)
                ? whatIf.swap.find((id) => id !== selected)
                : undefined
            }
            onSwap={(other) =>
              setQuery(
                writeWhatIf(
                  query,
                  other ? { ...whatIf, overrides: [], swap: [selected, other] } : { overrides: [] },
                ),
              )
            }
          />
        </div>
      </div>
    </div>
  )
}

function Legend({ overrides, onReset }: { overrides: number; onReset: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
      <span className="font-semibold uppercase tracking-wider">How to read the bracket:</span>
      <span>
        black numbers <span className="font-semibold text-ink">(e.g. 13-9)</span> are the real score
      </span>
      <span>
        <span className="text-accent">orange %</span> is the model's chance to win (click it for a
        what-if)
      </span>
      <span>
        <span className="bg-accent-soft px-1 text-accent">W*</span> is a what-if win, only in this
        link
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
