import { useMemo } from 'react'
import type { PlayoffStage, SwissStage } from '../../../data/schemas/event-config.ts'
import { buildEventChain } from '../../../engine/event-chain.ts'
import { type BracketMatch, resolveBracket, roundCount } from '../../../engine/playoffs/bracket.ts'
import type { EventChain } from '../../../engine/simulate-event.ts'
import { currentRound } from '../../../engine/simulate-swiss.ts'
import { stageSeeds } from '../../../engine/swiss/stage-seeds.ts'
import { FreshnessBar } from '../components/FreshnessBar.tsx'
import { Page, PageHeader } from '../components/Page.tsx'
import { type MatchKind, PlayoffBracket, pairKey } from '../components/PlayoffBracket.tsx'
import { PlayoffOddsTable } from '../components/PlayoffOddsTable.tsx'
import { SimStatus } from '../components/SimStatus.tsx'
import { type EventData, ratings, syncStatus, teamName } from '../lib/data.ts'
import { shortDate } from '../lib/format.ts'
import { readWhatIf, toggleOverride, writeWhatIf } from '../lib/overrides.ts'
import { setQuery } from '../lib/router.ts'
import { currentDraw, modelRequest } from '../sim/requests.ts'
import { usePlayoffSimulation, useStageSimulation } from '../sim/useSimulation.ts'

interface Props {
  event: EventData
  stage: PlayoffStage
  query: URLSearchParams
}

const unverifiedNote = (formats: readonly string[]) =>
  formats.length > 0
    ? `The final is ${formats.join('/').toUpperCase()} (confirmed). Its map ban/pick order is not published yet, so title odds use an assumed order.`
    : undefined

export function PlayoffsPage({ event, stage, query }: Props) {
  const seeds = stageSeeds(event.teams.participants, stage.id)
  const seeded = seeds.length === stage.bracket.length * 2
  return seeded ? (
    <SeededPlayoffs event={event} stage={stage} seeds={seeds} query={query} />
  ) : (
    <ProjectedPlayoffs event={event} stage={stage} />
  )
}

/** `status` (e.g. "2 of 7 played") follows the dates once the seeds are known. */
function Header(props: { stage: PlayoffStage; status?: string; running: boolean }) {
  const { stage, status, running } = props
  return (
    <PageHeader
      title={stage.name}
      subtitle={
        <>
          {shortDate(stage.start)}–{shortDate(stage.end)}
          {status && ` · ${status}`}
          <SimStatus running={running} />
        </>
      }
    >
      <FreshnessBar sync={syncStatus} stage={stage} ratingsAsOf={ratings.asOf} />
    </PageHeader>
  )
}

/** The bracket with real results, what-ifs and odds, once the seeds are known. */
function SeededPlayoffs(props: EventProps & { seeds: string[]; query: URLSearchParams }) {
  const { event, stage, seeds, query } = props
  const whatIf = readWhatIf(query)
  const name = (id: string) => teamName(event, id)
  const rounds = roundCount(stage)
  const real = event.results.matches.filter((m) => m.stageId === stage.id)
  const realByPair = new Map(real.map((m) => [pairKey(m.teamA, m.teamB), m]))
  const overrideByPair = new Map(
    whatIf.overrides
      .filter((o) => !realByPair.has(pairKey(o.winner, o.loser)))
      .map((o) => [pairKey(o.winner, o.loser), o]),
  )

  // Real results first, then what-ifs; an override whose pair never meets is simply unused.
  const kinds = new Map<string, MatchKind>()
  let matches: BracketMatch[] = []
  let bracketError: string | undefined
  try {
    matches = resolveBracket(seeds, stage, ({ teamA, teamB }) => {
      const key = pairKey(teamA, teamB)
      const result = realByPair.get(key)
      if (result) {
        kinds.set(key, 'real')
        return result.winner
      }
      const override = overrideByPair.get(key)
      if (override) kinds.set(key, 'override')
      return override?.winner
    })
  } catch (error) {
    bracketError = error instanceof Error ? error.message : String(error)
  }
  const played = matches.flatMap((m) =>
    m.teamA && m.teamB && m.winner ? [{ teamA: m.teamA, teamB: m.teamB, winner: m.winner }] : [],
  )
  const scores = new Map(
    real.map((m) => {
      const winsA = m.maps.filter((map) => map.scoreA > map.scoreB).length
      // Scores are shown teamA (higher seed) first, whatever order Liquipedia used.
      const higherFirst = seeds.indexOf(m.teamA) < seeds.indexOf(m.teamB)
      const [a, b] = higherFirst ? [winsA, m.maps.length - winsA] : [m.maps.length - winsA, winsA]
      return [pairKey(m.teamA, m.teamB), `${a}-${b}`]
    }),
  )

  const sim = usePlayoffSimulation(
    bracketError
      ? undefined
      : { ...modelRequest(event, stage), kind: 'playoffs', seeds, rules: stage, played },
  )
  const prediction = sim.prediction
  const pending = new Map(
    (prediction?.sim.upcoming ?? []).map((m) => [pairKey(m.teamA, m.teamB), m.pA]),
  )
  const note = unverifiedNote(prediction?.unverifiedVeto ?? [])
  const onPick = (match: BracketMatch, winner: string) => {
    const loser = winner === match.teamA ? match.teamB : match.teamA
    if (!loser) return
    setQuery(writeWhatIf(query, toggleOverride(whatIf, match.round, winner, loser)))
  }
  // Status and the override count use what is actually decided, not what-ifs or stale URL entries.
  const decided = matches.filter((m) => kinds.get(pairKey(m.teamA ?? '', m.teamB ?? '')) === 'real')
  const status =
    matches.length > 0 && decided.length === matches.length
      ? 'finished'
      : `${decided.length} of ${matches.length} played`
  const forced = [...kinds.values()].filter((kind) => kind === 'override').length
  const finalUnverified = prediction?.unverifiedVeto.includes(stage.format.final) ?? false

  return (
    <Page rough={sim.running}>
      <Header stage={stage} status={status} running={sim.running} />
      {forced > 0 && (
        <p className="text-sm text-ink-2">
          <span className="text-[11px] uppercase tracking-wider text-accent">override</span>{' '}
          {forced} forced result{forced === 1 ? '' : 's'} (not real).{' '}
          <button
            type="button"
            className="underline decoration-rule underline-offset-2 hover:decoration-ink"
            onClick={() => setQuery(writeWhatIf(query, { ...whatIf, overrides: [] }))}
          >
            Reset
          </button>
        </p>
      )}
      {(bracketError ?? sim.error) && (
        <p className="text-sm text-loss" role="alert">
          {bracketError ?? sim.error}
        </p>
      )}
      <PlayoffBracket
        matches={matches}
        defaultFormat={stage.format.default}
        rounds={rounds}
        kinds={kinds}
        scores={scores}
        pending={pending}
        name={name}
        seedOf={(team) => seeds.indexOf(team) + 1 || undefined}
        onPick={onPick}
        {...(finalUnverified
          ? { finalNote: `${stage.format.final.toUpperCase()}: ban/pick order assumed` }
          : {})}
      />
      <section className="flex max-w-2xl flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">Probabilities</h2>
        {prediction ? (
          <PlayoffOddsTable
            tagLabel="Seed"
            columns={[
              { label: 'Semis', title: 'Reaches the semifinals' },
              { label: 'Final', title: 'Reaches the final' },
              { label: 'Title', title: 'Wins the Major', strong: true },
              ...(stage.thirdPlaceDecider
                ? [{ label: '3rd', title: 'Wins the third-place match' }]
                : []),
            ]}
            rows={[...prediction.teams]
              .sort(
                (a, b) => b.pTitle - a.pTitle || seeds.indexOf(a.teamId) - seeds.indexOf(b.teamId),
              )
              .map((t) => ({
                teamId: t.teamId,
                tag: String(seeds.indexOf(t.teamId) + 1),
                values: [
                  t.pSemifinal,
                  t.pFinal,
                  t.pTitle,
                  ...(stage.thirdPlaceDecider ? [t.pThird] : []),
                ],
                reason: t.reason,
              }))}
            name={name}
            {...(note ? { note } : {})}
          />
        ) : (
          <p className="text-sm text-ink-3">Simulating…</p>
        )}
      </section>
    </Page>
  )
}

interface EventProps {
  event: EventData
  stage: PlayoffStage
}

/** Before the seeds are known: the empty bracket and title odds from the whole-event simulation. */
function ProjectedPlayoffs({ event, stage }: EventProps) {
  const name = (id: string) => teamName(event, id)
  const rounds = roundCount(stage)
  // The stage the event is in: the first Swiss stage that is seeded and not finished.
  const current = event.config.stages.find((s): s is SwissStage => {
    if (s.type !== 'swiss') return false
    const seeds = stageSeeds(event.teams.participants, s.id)
    if (seeds.length < s.teamCount) return false
    const played = event.results.matches.filter((m) => m.stageId === s.id)
    return currentRound(seeds, played, s) <= 5
  })
  const chain = useMemo(
    () =>
      current ? buildEventChain(event.config, event.teams.participants, current.id) : undefined,
    [event, current],
  )
  const swissRequest = (stage: SwissStage, stageChain: EventChain) => {
    const seeds = stageSeeds(event.teams.participants, stage.id)
    const rules = {
      winsToAdvance: stage.winsToAdvance,
      lossesToEliminate: stage.lossesToEliminate,
      initialPairing: stage.initialPairing,
    }
    const played = event.results.matches
      .filter((m) => m.stageId === stage.id)
      .map(({ round, teamA, teamB, winner }) => ({ round, teamA, teamB, winner }))
    const draw = currentDraw(event, stage.id, seeds, played, rules)
    return {
      ...modelRequest(event, stage),
      kind: 'swiss' as const,
      seeds,
      rules,
      format: stage.format,
      played,
      ...(draw ? { announced: draw.pairings } : {}),
      chain: stageChain,
    }
  }
  const swiss = current && chain ? swissRequest(current, chain) : undefined
  const sim = useStageSimulation(swiss)
  const eventOdds = sim.prediction?.event
  const stageOf = (teamId: string) => {
    const entry = event.teams.participants.find((p) => p.teamId === teamId)?.entryStage
    return event.config.stages.find((s) => s.id === entry)?.name ?? ''
  }
  const note = unverifiedNote(eventOdds?.unverifiedVeto ?? [])

  // Placeholder seeds "1".."8" for the empty bracket.
  const slots = stage.bracket.flat().map((_, i) => String(i + 1))
  let skeleton: BracketMatch[] = []
  let bracketError: string | undefined
  try {
    skeleton = resolveBracket(slots, stage, () => undefined)
  } catch (error) {
    bracketError = error instanceof Error ? error.message : String(error)
  }

  return (
    <Page rough={sim.running}>
      <Header stage={stage} running={sim.running} />
      {(bracketError ?? sim.error) && (
        <p className="text-sm text-loss" role="alert">
          {bracketError ?? sim.error}
        </p>
      )}
      <PlayoffBracket
        matches={skeleton}
        defaultFormat={stage.format.default}
        rounds={rounds}
        kinds={new Map()}
        scores={new Map()}
        pending={new Map()}
        name={(slot) => `Seed ${slot}`}
        seedOf={() => undefined}
      />
      <section className="flex max-w-2xl flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">Projected title odds</h2>
        {!current ? (
          <p className="text-sm text-ink-3">No Swiss stage is running.</p>
        ) : eventOdds ? (
          <PlayoffOddsTable
            tagLabel="Starts in"
            columns={[
              { label: 'Playoffs', title: 'Reaches the playoffs (whole-event simulation)' },
              { label: 'Title', title: 'Wins the Major (whole-event simulation)', strong: true },
            ]}
            rows={[...eventOdds.teams]
              .sort((a, b) => (b.pTitle ?? 0) - (a.pTitle ?? 0) || b.pPlayoffs - a.pPlayoffs)
              .map((t) => ({
                teamId: t.teamId,
                tag: stageOf(t.teamId),
                values: [t.pPlayoffs, t.pTitle],
              }))}
            name={name}
            {...(note ? { note } : {})}
          />
        ) : (
          <p className="text-sm text-ink-3">Simulating…</p>
        )}
      </section>
    </Page>
  )
}
