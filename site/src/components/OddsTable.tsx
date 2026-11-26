import type { TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { outcomeOpen, pct, recordStatus } from '../lib/format.ts'
import { TeamLogo } from './TeamLogo.tsx'

type StageKey = 'p30' | 'pAdvance' | 'p03'

interface Props {
  teams: TeamOutlook[]
  selected?: string
  name: (teamId: string) => string
  /** Short name (e.g. "NIP"), used on narrow screens. */
  short: (teamId: string) => string
  /** Each team's odds before the stage's first round (from its snapshot). */
  start?: Map<string, Pick<TeamOutlook, StageKey>>
  onSelect: (teamId: string) => void
  /** Formats whose veto is assumed, not verified, in the playoff and title odds (e.g. ["bo5"]). */
  unverifiedVeto?: readonly string[]
  /** The stage's rules, to mark teams that are through (bold) or out (grey). */
  winsToAdvance: number
  lossesToEliminate: number
}

const eventColumns: Array<{ key: 'pPlayoffs' | 'pTitle'; label: string; title: string }> = [
  { key: 'pPlayoffs', label: 'Playoffs', title: 'Reaches the playoffs (whole-event simulation)' },
  { key: 'pTitle', label: 'Title', title: 'Wins the Major (whole-event simulation)' },
]

const columns: Array<{ key: StageKey; label: string; title: string }> = [
  { key: 'p30', label: '3-0', title: 'Advances without a loss' },
  { key: 'pAdvance', label: 'Advance', title: 'Reaches 3 wins' },
  { key: 'p03', label: '0-3', title: 'Eliminated without a win' },
]

/** On wider screens the number columns share the width evenly, so the team column stays compact (about 22%). */
const numberWidth = 'sm:w-[13%]'

/**
 * Full team names need about 610 px of table. The table checks its own width (a container query),
 * not the window's, so it switches to short names (NIP) whenever its column is narrower: beside the
 * team panel at 1024-1100 px, or full width at 640-680 px.
 */
const fullNames = '@min-[620px]:inline'
const shortNames = '@min-[620px]:hidden'

export function OddsTable(props: Props) {
  const { teams, selected, name, short, start, onSelect, unverifiedVeto = [] } = props
  const { winsToAdvance, lossesToEliminate } = props
  const sorted = [...teams].sort((a, b) => b.pAdvance - a.pAdvance || b.p30 - a.p30)
  const assumed = unverifiedVeto.length > 0
  const titleNote = assumed
    ? `. The final is ${unverifiedVeto.join('/').toUpperCase()}; its ban/pick order is not published yet, so these odds use an assumed order (see Methodology).`
    : ''
  return (
    <div className="@container">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-left font-display text-xs uppercase tracking-wider text-ink-2">
            <th className="py-1.5 pr-2 font-semibold">Team</th>
            <th
              className={`px-2 py-1.5 text-right font-semibold ${numberWidth}`}
              title="Wins and losses in this stage"
            >
              <span className="sm:hidden">W-L</span>
              <span className="hidden sm:inline">Record</span>
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                // On wide screens the right padding skips the change column, so the label sits over
                // the percentage (change: w-7 + gap-1.5 = 34 px).
                className={`px-2 py-1.5 text-right font-semibold sm:pr-[42px] ${numberWidth}`}
                title={`${column.title}. The small number is the change since round 1.`}
              >
                {column.label}
              </th>
            ))}
            {eventColumns.map((column, index) => (
              <th
                key={column.key}
                className={`relative hidden py-1.5 text-right font-semibold sm:table-cell ${numberWidth} ${index === eventColumns.length - 1 ? 'pl-2' : 'px-2'}`}
                title={column.key === 'pTitle' ? `${column.title}${titleNote}` : column.title}
              >
                {column.label}
                {/* Hangs outside the cell, so "Title" lines up with the numbers below. */}
                {column.key === 'pTitle' && assumed && (
                  <span className="absolute" aria-hidden="true">
                    *
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((team) => {
            const status = recordStatus(team.record, winsToAdvance, lossesToEliminate)
            const out = status === 'eliminated'
            return (
              <tr
                key={team.teamId}
                className={`cursor-pointer border-b border-rule leading-5 ${selected === team.teamId ? 'bg-paper-2' : 'hover:bg-paper-2'}`}
                onClick={() => onSelect(team.teamId)}
              >
                <td className="whitespace-nowrap py-2 pr-2">
                  <TeamLogo teamId={team.teamId} className="mr-2 align-middle" />
                  <span
                    className={`${selected === team.teamId || status === 'advanced' ? 'font-semibold' : ''} ${out ? 'text-ink-3' : ''}`}
                  >
                    <span className={shortNames}>{short(team.teamId)}</span>
                    <span className={`hidden ${fullNames}`}>{name(team.teamId)}</span>
                  </span>
                  {team.confidence === 'low' && (
                    <span
                      className="ml-1.5 whitespace-nowrap text-xs text-ink-3"
                      title="Few tier-1 matches for this team, so its odds are rough"
                    >
                      little data
                    </span>
                  )}
                </td>
                <td className={`num px-2 py-2 text-right ${out ? 'text-ink-3' : 'text-ink-2'}`}>
                  {team.record}
                </td>
                {columns.map((column) => (
                  <td key={column.key} className="num px-2 py-2 text-right">
                    {column.key === 'pAdvance' ||
                    outcomeOpen(team.record, column.label as '3-0' | '0-3') ? (
                      <Odds
                        value={team[column.key]}
                        start={start?.get(team.teamId)?.[column.key]}
                        strong={column.key === 'pAdvance' && status === 'advanced'}
                        muted={out}
                      />
                    ) : (
                      <span
                        className="text-ink-3 sm:mr-[34px]"
                        title={`No longer possible at ${team.record}`}
                      >
                        –
                      </span>
                    )}
                  </td>
                ))}
                {eventColumns.map((column, index) => {
                  const value = team[column.key]
                  return (
                    <td
                      key={column.key}
                      className={`num hidden py-2 text-right sm:table-cell ${index === eventColumns.length - 1 ? 'pl-2' : 'px-2'} ${value === undefined || out ? 'text-ink-3' : 'text-ink-2'}`}
                    >
                      {value === undefined ? '–' : pct(value)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A stage chance and how many points it moved since round 1 (shown from 1 point up). Strong (bold)
 * for a team that is through, muted (grey) for one that is out.
 */
function Odds(props: {
  value: number
  start: number | undefined
  strong: boolean
  muted: boolean
}) {
  const { value, start, strong, muted } = props
  const delta = start === undefined ? 0 : Math.round(value * 100) - Math.round(start * 100)
  const title = start === undefined ? undefined : `Before round 1: ${pct(start)}, now ${pct(value)}`
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={title}>
      <span className={`${muted ? 'text-ink-3' : 'text-accent'} ${strong ? 'font-semibold' : ''}`}>
        {pct(value)}
      </span>
      {start !== undefined && (
        <span
          className={`hidden w-7 text-left text-xs sm:inline-block ${muted ? 'text-ink-3' : delta > 0 ? 'text-win' : delta < 0 ? 'text-loss' : 'text-ink-3'}`}
        >
          {delta === 0 ? '' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`}
        </span>
      )}
    </span>
  )
}
