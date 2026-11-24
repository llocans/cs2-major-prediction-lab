import type { CSSProperties, DragEvent } from 'react'
import type { PlayoffStage, SwissStage } from '../../../data/schemas/event-config.ts'
import {
  chanceOfBox,
  cleanSwissPicks,
  emptySwissPicks,
  modelPlayoffPicks,
  modelSwissPicks,
  type PickStatus,
  type PlayoffPicks,
  playoffRoundChance,
  prunePlayoffPicks,
  SWISS_BOXES,
  type SwissBox,
  type SwissPickemRules,
  type SwissPicks,
  scorePlayoffPicks,
  scoreSwissPicks,
  slotCandidates,
  slotKey,
  swissPickChance,
  tally,
} from '../../../engine/pickem.ts'
import { type BracketMatch, resolveBracket, roundCount } from '../../../engine/playoffs/bracket.ts'
import { buildRecords } from '../../../engine/swiss/records.ts'
import { stageSeeds } from '../../../engine/swiss/stage-seeds.ts'
import { SimStatus } from '../components/SimStatus.tsx'
import { TeamLogo } from '../components/TeamLogo.tsx'
import { type EventData, teamName } from '../lib/data.ts'
import { pct, shortDate } from '../lib/format.ts'
import { type StoredPicks, useStoredPicks } from '../lib/pickem-store.ts'
import { modelRequest } from '../sim/requests.ts'
import { usePlayoffSimulation, useSwissOutcomeSimulation } from '../sim/useSimulation.ts'

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

const BOX_LABEL: Record<SwissBox, string> = {
  threeZero: '3-0',
  advance: '3-1 / 3-2',
  zeroThree: '0-3',
}
const BOX_TITLE: Record<SwissBox, string> = {
  threeZero: 'Advances without a loss',
  advance: 'Advances with one or two losses (a 3-0 does not count)',
  zeroThree: 'Eliminated without a win',
}

export function PickemPage({ event, stageId }: { event: EventData; stageId?: string }) {
  const stages = event.config.stages
  const stage = stages.find((s) => s.id === stageId) ?? stages[0]
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-5xl font-bold leading-none tracking-tight">Pick'Em</h1>
        <p className="text-sm text-ink-2">
          Make your picks as in the in-game Pick'Em and see your chance next to the model's. Saved
          in this browser only.
        </p>
      </header>
      <nav className="flex flex-wrap gap-x-5 gap-y-1 border-b border-rule pb-2">
        {stages.map((s) => (
          <a
            key={s.id}
            href={`#/pickem/${s.id}`}
            className={`font-display text-lg font-semibold ${s.id === stage?.id ? 'text-ink underline decoration-accent decoration-2 underline-offset-4' : 'text-ink-3 hover:text-ink'}`}
          >
            {s.name}
          </a>
        ))}
      </nav>
      {stage?.type === 'swiss' && <SwissPickem key={stage.id} event={event} stage={stage} />}
      {stage?.type === 'single-elimination' && (
        <PlayoffPickem key={stage.id} event={event} stage={stage} />
      )}
    </div>
  )
}

function Closed({ text }: { text: string }) {
  return <p className="text-sm text-ink-3">{text}</p>
}

/** "Last changed" line; flags picks changed on or after the stage's first day. */
function Changed({ stored, start }: { stored?: StoredPicks; start: string }) {
  if (!stored) return null
  const at = new Date(stored.updatedAt)
  const late = stored.updatedAt >= `${start}T00:00:00.000Z`
  return (
    <p className="text-xs text-ink-3">
      Last changed {shortDate(stored.updatedAt)}{' '}
      {at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      {late && ' · changed after the stage began'}
    </p>
  )
}

const statusClass: Record<PickStatus, string> = {
  correct: 'border-l-win',
  wrong: 'border-l-loss',
  pending: 'border-l-rule',
}

function StatusMark({ status }: { status: PickStatus | undefined }) {
  if (status === 'correct')
    return <span className="text-[11px] font-semibold uppercase text-win">right</span>
  if (status === 'wrong')
    return <span className="text-[11px] font-semibold uppercase text-loss">wrong</span>
  return null
}

function Score({ statuses }: { statuses: Iterable<PickStatus> }) {
  const { correct, wrong, pending } = tally(statuses)
  return (
    <span className="num">
      <span className="text-win">{correct} right</span> ·{' '}
      <span className="text-loss">{wrong} wrong</span> · {pending} open
    </span>
  )
}

// ---------------------------------------------------------------- Swiss

function SwissPickem({ event, stage }: { event: EventData; stage: SwissStage }) {
  const seeds = stageSeeds(event.teams.participants, stage.id)
  const format = event.config.pickem?.swiss
  if (!format) return <Closed text="This event's config has no Pick'Em format." />
  if (seeds.length < stage.teamCount) {
    return (
      <Closed
        text={`Opens when all ${stage.teamCount} teams are known, after the previous stage ends (${seeds.length} of ${stage.teamCount} so far).`}
      />
    )
  }
  return <SwissBoard event={event} stage={stage} seeds={seeds} format={format} />
}

function SwissBoard(props: {
  event: EventData
  stage: SwissStage
  seeds: string[]
  format: SwissPickemRules
}) {
  const { event, stage, seeds, format } = props
  const name = (id: string) => teamName(event, id)
  const rules = {
    winsToAdvance: stage.winsToAdvance,
    lossesToEliminate: stage.lossesToEliminate,
    initialPairing: stage.initialPairing,
  }
  const played = event.results.matches
    .filter((m) => m.stageId === stage.id)
    .map(({ round, teamA, teamB, winner }) => ({ round, teamA, teamB, winner }))
  const records = buildRecords(seeds, played)

  const sim = useSwissOutcomeSimulation({
    ...modelRequest(event),
    kind: 'swiss',
    seeds,
    rules,
    format: stage.format,
    played,
    collectOutcomes: true,
  })
  const odds = new Map((sim.prediction?.value.teams ?? []).map((t) => [t.teamId, t]))
  const outcomes = sim.prediction?.outcomes

  const [stored, save] = useStoredPicks(event.config.id, stage.id)
  const picks: SwissPicks = cleanSwissPicks(stored?.swiss ?? emptySwissPicks(), seeds, format)
  const boxOf = (team: string) => SWISS_BOXES.find((box) => picks[box].includes(team))
  const setPicks = (next: SwissPicks) => save({ swiss: next })

  const place = (team: string, box: SwissBox | undefined) => {
    const next: SwissPicks = {
      threeZero: picks.threeZero.filter((t) => t !== team),
      advance: picks.advance.filter((t) => t !== team),
      zeroThree: picks.zeroThree.filter((t) => t !== team),
    }
    if (box && boxOf(team) !== box) {
      if (next[box].length >= format[box]) return // box full: remove a team first
      next[box] = [...next[box], team]
    }
    setPicks(next)
  }

  const model =
    odds.size > 0
      ? modelSwissPicks(
          seeds.flatMap((id) => odds.get(id) ?? []),
          format,
        )
      : undefined
  const yourChance = outcomes ? swissPickChance(picks, outcomes, format.toPass) : undefined
  const modelChance =
    model && outcomes ? swissPickChance(model, outcomes, format.toPass) : undefined
  const yourStatus = scoreSwissPicks(picks, records, rules)
  const modelStatus = model ? scoreSwissPicks(model, records, rules) : new Map<string, PickStatus>()
  const total = format.threeZero + format.advance + format.zeroThree
  const placed = SWISS_BOXES.reduce((n, box) => n + picks[box].length, 0)

  const drag = (team: string) => (e: DragEvent) => e.dataTransfer.setData('text/plain', team)
  const drop = (box: SwissBox | undefined) => (e: DragEvent) => {
    e.preventDefault()
    const team = e.dataTransfer.getData('text/plain')
    if (seeds.includes(team)) place(team, box)
  }

  return (
    <div
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
      data-rough={sim.running || undefined}
    >
      <section aria-label="Teams" onDragOver={(e) => e.preventDefault()} onDrop={drop(undefined)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink font-display text-xs uppercase tracking-wider text-ink-3">
              <th className="py-1 text-left font-semibold">Team</th>
              <th className="w-12 py-1 text-right font-semibold">Now</th>
              {SWISS_BOXES.map((box) => (
                <th key={box} className="w-20 py-1 text-right font-semibold" title={BOX_TITLE[box]}>
                  {BOX_LABEL[box]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seeds.map((team) => {
              const record = records.get(team)
              const teamOdds = odds.get(team)
              const current = boxOf(team)
              return (
                <tr
                  key={team}
                  draggable
                  onDragStart={drag(team)}
                  className="cursor-grab border-b border-rule"
                >
                  <td className="truncate py-1.5 pr-2">
                    <TeamLogo teamId={team} className="mr-2 align-[-3px]" />
                    {name(team)}
                  </td>
                  <td className="num py-1.5 text-right text-ink-2">
                    {record ? `${record.wins}-${record.losses}` : '0-0'}
                  </td>
                  {SWISS_BOXES.map((box) => {
                    const on = current === box
                    const full = !on && picks[box].length >= format[box]
                    return (
                      <td key={box} className="py-1 pl-1 text-right">
                        <button
                          type="button"
                          onClick={() => place(team, on ? undefined : box)}
                          disabled={full}
                          title={
                            full
                              ? `The ${BOX_LABEL[box]} box is full`
                              : on
                                ? 'Remove pick'
                                : `Pick ${name(team)} for ${BOX_LABEL[box]}`
                          }
                          className={[
                            'num w-full rounded-sm border px-1.5 py-0.5 text-xs',
                            on
                              ? 'border-accent bg-accent font-semibold text-accent-ink'
                              : full
                                ? 'border-transparent text-ink-3 opacity-40'
                                : 'border-rule text-accent hover:bg-accent-soft',
                          ].join(' ')}
                        >
                          {teamOdds ? pct(chanceOfBox(teamOdds, box)) : '…'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-3">
          Percentages are the model's chance of each finish. Click one to pick it, or drag a team
          onto a box. A 3-0 team does not count for 3-1 / 3-2.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-1 border-b border-ink pb-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Your picks</h2>
            <span className="num text-sm text-ink-2">
              {placed} of {total}
            </span>
          </div>
          <p className="text-sm">
            Chance of {format.toPass}+ right:{' '}
            <span className="num font-display text-2xl font-semibold text-accent">
              {yourChance && placed > 0 ? pct(yourChance.pPass) : '–'}
            </span>
            {yourChance && placed > 0 && (
              <span className="num text-ink-2"> · {yourChance.expected.toFixed(1)} expected</span>
            )}
          </p>
          {played.length > 0 && placed > 0 && (
            <p className="text-sm">
              So far: <Score statuses={yourStatus.values()} />
            </p>
          )}
          <SimStatus running={sim.running} className="" hint="you can keep picking" />
          <Changed stored={stored} start={stage.start} />
          <div className="mt-1 flex gap-4 text-sm">
            <button
              type="button"
              className="text-accent underline underline-offset-2 disabled:text-ink-3 disabled:no-underline"
              disabled={!model}
              onClick={() =>
                model &&
                setPicks({
                  threeZero: [...model.threeZero],
                  advance: [...model.advance],
                  zeroThree: [...model.zeroThree],
                })
              }
            >
              Copy the model's picks
            </button>
            {placed > 0 && (
              <button
                type="button"
                className="text-ink-2 underline underline-offset-2"
                onClick={() => save(undefined)}
              >
                Clear
              </button>
            )}
          </div>
        </section>

        {SWISS_BOXES.map((box) => (
          <section
            key={box}
            aria-label={`${BOX_LABEL[box]} picks`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={drop(box)}
          >
            <h3 className="mb-1 flex items-baseline justify-between font-display text-sm font-semibold uppercase tracking-wider text-ink-2">
              <span title={BOX_TITLE[box]}>{BOX_LABEL[box]}</span>
              <span className="num text-xs text-ink-3">
                {picks[box].length}/{format[box]}
              </span>
            </h3>
            <ul className="grid grid-cols-2 gap-1">
              {Array.from({ length: format[box] }, (_, i) => {
                const team = picks[box][i]
                if (!team) {
                  return (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: empty slots have no identity.
                      key={i}
                      className="h-8 rounded-sm border border-dashed border-rule"
                    />
                  )
                }
                const teamOdds = odds.get(team)
                const status = yourStatus.get(team)
                return (
                  <li
                    key={team}
                    draggable
                    onDragStart={drag(team)}
                    className={`flex h-8 cursor-grab items-center gap-1 rounded-sm border border-l-4 border-rule bg-paper-2 px-2 text-sm ${statusClass[status ?? 'pending']}`}
                  >
                    <TeamLogo teamId={team} />
                    <button
                      type="button"
                      className={`min-w-0 flex-1 truncate text-left ${status === 'wrong' ? 'text-ink-3 line-through' : ''}`}
                      title="Remove pick"
                      onClick={() => place(team, undefined)}
                    >
                      {name(team)}
                    </button>
                    <StatusMark status={status} />
                    {status === 'pending' && teamOdds && (
                      <span className="num text-xs text-accent">
                        {pct(chanceOfBox(teamOdds, box))}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {model && (
          <section className="border-t border-rule pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-bold">The model's picks</h2>
              <span className="num text-sm text-ink-2">
                {modelChance
                  ? `${pct(modelChance.pPass)} for ${format.toPass}+ · ${modelChance.expected.toFixed(1)} expected`
                  : ''}
              </span>
            </div>
            {played.length > 0 && (
              <p className="text-sm">
                So far: <Score statuses={modelStatus.values()} />
              </p>
            )}
            <dl className="mt-1 grid gap-1 text-sm">
              {SWISS_BOXES.map((box) => (
                <div key={box} className="flex gap-2">
                  <dt className="num w-16 shrink-0 text-ink-3">{BOX_LABEL[box]}</dt>
                  <dd className="text-ink-2">
                    {model[box].map((team, i) => (
                      <span key={team}>
                        {i > 0 && ', '}
                        <span
                          className={
                            modelStatus.get(team) === 'correct'
                              ? 'text-win'
                              : modelStatus.get(team) === 'wrong'
                                ? 'text-loss line-through'
                                : ''
                          }
                        >
                          {name(team)}
                        </span>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-ink-3">
              The model's picks get the most right on average: a team goes in the box where it adds
              the most, so a strong team can sit in 3-1 / 3-2 rather than 3-0. The chance counts how
              often a set of picks gets {format.toPass}+ right across{' '}
              {outcomes?.runs.toLocaleString('en-GB') ?? '…'} simulated stages .
            </p>
          </section>
        )}
        {sim.error && (
          <p className="text-sm text-loss" role="alert">
            {sim.error}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Playoffs

function roundName(round: number, rounds: number): string {
  const fromEnd = rounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round ${round}`
}

function PlayoffPickem({ event, stage }: { event: EventData; stage: PlayoffStage }) {
  const seeds = stageSeeds(event.teams.participants, stage.id)
  const size = stage.bracket.length * 2
  if (seeds.length < size) {
    return (
      <Closed
        text={`Opens when the ${size} playoff teams are known, after the last Swiss stage ends (${seeds.length} of ${size} so far).`}
      />
    )
  }
  return <PlayoffBoard event={event} stage={stage} seeds={seeds} />
}

function PlayoffBoard(props: { event: EventData; stage: PlayoffStage; seeds: string[] }) {
  const { event, stage, seeds } = props
  const name = (id: string) => teamName(event, id)
  const rounds = roundCount(stage)
  const real = event.results.matches.filter((m) => m.stageId === stage.id)
  const realByPair = new Map(real.map((m) => [pairKey(m.teamA, m.teamB), m.winner]))

  let bracket: BracketMatch[] = []
  let error: string | undefined
  try {
    bracket = resolveBracket(seeds, stage, ({ teamA, teamB }) =>
      realByPair.get(pairKey(teamA, teamB)),
    )
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const played = bracket.flatMap((m) =>
    m.teamA && m.teamB && m.winner ? [{ teamA: m.teamA, teamB: m.teamB, winner: m.winner }] : [],
  )
  const sim = usePlayoffSimulation(
    error ? undefined : { ...modelRequest(event), kind: 'playoffs', seeds, rules: stage, played },
  )
  const odds = new Map((sim.prediction?.teams ?? []).map((t) => [t.teamId, t]))
  const chance = (team: string, round: number) => {
    const o = odds.get(team)
    return o ? playoffRoundChance(o, round, rounds) : undefined
  }

  const firstRound = bracket.filter((m) => m.round === 1 && !m.thirdPlace)
  const [stored, save] = useStoredPicks(event.config.id, stage.id)
  const picks = prunePlayoffPicks(stored?.playoffs ?? {}, firstRound, rounds)
  const setPick = (key: string, team: string) => {
    const next: PlayoffPicks = { ...picks }
    if (next[key] === team) delete next[key]
    else next[key] = team
    save({ playoffs: prunePlayoffPicks(next, firstRound, rounds) })
  }
  const model =
    odds.size > 0 ? modelPlayoffPicks(firstRound, rounds, [...odds.values()]) : undefined
  const yourStatus = scorePlayoffPicks(picks, bracket)
  const modelStatus = model ? scorePlayoffPicks(model, bracket) : new Map<string, PickStatus>()
  const expected = (p: PlayoffPicks) =>
    Object.entries(p).reduce((sum, [key, team]) => {
      const round = Number(key.split('-')[0])
      return sum + (chance(team, round) ?? 0)
    }, 0)
  const slots = 2 ** rounds - 1
  const made = Object.keys(picks).length

  return (
    <div className="flex flex-col gap-6" data-rough={sim.running || undefined}>
      <section className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-ink pb-3 text-sm">
        <span>
          Your picks{' '}
          <span className="num text-ink-2">
            {made} of {slots}
          </span>
        </span>
        <span>
          Expected right:{' '}
          <span className="num font-display text-2xl font-semibold text-accent">
            {odds.size > 0 && made > 0 ? expected(picks).toFixed(1) : '–'}
          </span>
        </span>
        {model && (
          <span className="text-ink-2">
            Model: <span className="num">{expected(model).toFixed(1)}</span> expected
            {played.length > 0 && (
              <>
                {' '}
                · <Score statuses={modelStatus.values()} />
              </>
            )}
          </span>
        )}
        {played.length > 0 && made > 0 && (
          <span>
            You so far: <Score statuses={yourStatus.values()} />
          </span>
        )}
        <span className="flex gap-4">
          <button
            type="button"
            className="text-accent underline underline-offset-2 disabled:text-ink-3 disabled:no-underline"
            disabled={!model}
            onClick={() => model && save({ playoffs: { ...model } })}
          >
            Copy the model's picks
          </button>
          {made > 0 && (
            <button
              type="button"
              className="text-ink-2 underline underline-offset-2"
              onClick={() => save(undefined)}
            >
              Clear
            </button>
          )}
        </span>
        <Changed stored={stored} start={stage.start} />
        <SimStatus running={sim.running} className="" hint="you can keep picking" />
      </section>

      <div
        className="grid gap-6 md:[grid-template-columns:var(--cols)]"
        style={{ '--cols': `repeat(${rounds}, minmax(0, 1fr))` } as CSSProperties}
      >
        {Array.from({ length: rounds }, (_, r) => r + 1).map((round) => (
          <section key={round} className="flex flex-col justify-around gap-3">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-3">
              {roundName(round, rounds)}
            </h3>
            {Array.from({ length: 2 ** (rounds - round) }, (_, index) => {
              const key = slotKey(round, index)
              const candidates = slotCandidates(round, index, firstRound, picks)
              const status = yourStatus.get(key)
              return (
                <div
                  key={key}
                  className={`flex flex-col rounded-sm border border-l-4 border-rule ${statusClass[status ?? 'pending']}`}
                >
                  {candidates.length === 0 && (
                    <p className="px-2 py-2 text-xs text-ink-3">Pick the earlier matches first</p>
                  )}
                  {candidates.map((team) => {
                    const on = picks[key] === team
                    const p = chance(team, round)
                    return (
                      <button
                        key={team}
                        type="button"
                        onClick={() => setPick(key, team)}
                        className={`flex items-center gap-2 border-b border-rule px-2 py-1.5 text-left text-sm last:border-b-0 ${on ? 'bg-accent font-semibold text-accent-ink' : 'hover:bg-accent-soft'}`}
                      >
                        <TeamLogo teamId={team} />
                        <span className="min-w-0 flex-1 truncate">{name(team)}</span>
                        {on && <StatusMark status={status === 'pending' ? undefined : status} />}
                        <span className={`num text-xs ${on ? '' : 'text-accent'}`}>
                          {p === undefined ? '…' : pct(p)}
                        </span>
                      </button>
                    )
                  })}
                  {candidates.length === 1 && (
                    <p className="px-2 py-1 text-xs text-ink-3">Pick the other match first</p>
                  )}
                </div>
              )
            })}
          </section>
        ))}
      </div>
      <p className="text-xs text-ink-3">
        Pick the winner of every match. Later rounds offer your earlier picks, as in-game. The % is
        the model's chance that the team wins that round.
      </p>
      {(error || sim.error) && (
        <p className="text-sm text-loss" role="alert">
          {error ?? sim.error}
        </p>
      )}
    </div>
  )
}
