import type { TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { pct } from '../lib/format.ts'
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

/** On wider screens the number columns share the width evenly, so the team column stays compact. */
const numberWidth = 'sm:w-[12%]'

export function OddsTable(props: Props) {
  const { teams, selected, name, short, start, onSelect, unverifiedVeto = [] } = props
  const sorted = [...teams].sort((a, b) => b.pAdvance - a.pAdvance || b.p30 - a.p30)
  const assumed = unverifiedVeto.length > 0
  const titleNote = assumed
    ? `. The final is ${unverifiedVeto.join('/').toUpperCase()}; its ban/pick order is not published yet, so these odds use an assumed order (see Methodology).`
    : ''
  return (
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
              className={`px-2 py-1.5 text-right font-semibold ${numberWidth}`}
              title={`${column.title}. The small number is the change since round 1.`}
            >
              {column.label}
            </th>
          ))}
          {eventColumns.map((column, index) => (
            <th
              key={column.key}
              className={`hidden py-1.5 text-right font-semibold sm:table-cell ${numberWidth} ${index === eventColumns.length - 1 ? 'pl-2' : 'px-2'}`}
              title={column.key === 'pTitle' ? `${column.title}${titleNote}` : column.title}
            >
              {column.label}
              {column.key === 'pTitle' && assumed && <span aria-hidden="true">*</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((team) => (
          <tr
            key={team.teamId}
            className={`cursor-pointer border-b border-rule ${selected === team.teamId ? 'bg-paper-2' : 'hover:bg-paper-2'}`}
            onClick={() => onSelect(team.teamId)}
          >
            <td className="whitespace-nowrap py-2 pr-2">
              <TeamLogo teamId={team.teamId} className="mr-2 align-[-3px]" />
              <span className={selected === team.teamId ? 'font-semibold' : ''}>
                <span className="sm:hidden">{short(team.teamId)}</span>
                <span className="hidden sm:inline">{name(team.teamId)}</span>
              </span>
              {team.confidence === 'low' && (
                <span
                  className="ml-1.5 whitespace-nowrap text-[11px] uppercase tracking-wider text-ink-3"
                  title="Little tier-1 data on this team, so its odds are rough"
                >
                  low conf.
                </span>
              )}
            </td>
            <td className="num px-2 py-2 text-right text-ink-2">{team.record}</td>
            {columns.map((column) => (
              <td key={column.key} className="num px-2 py-2 text-right">
                <Odds
                  value={team[column.key]}
                  start={start?.get(team.teamId)?.[column.key]}
                  strong={column.key === 'pAdvance'}
                />
              </td>
            ))}
            {eventColumns.map((column, index) => {
              const value = team[column.key]
              return (
                <td
                  key={column.key}
                  className={`num hidden py-2 text-right sm:table-cell ${index === eventColumns.length - 1 ? 'pl-2' : 'px-2'} ${value === undefined ? 'text-ink-3' : 'text-ink-2'}`}
                >
                  {value === undefined ? '–' : pct(value)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A stage chance and how many points it moved since round 1 (shown from 1 point up). */
function Odds(props: { value: number; start: number | undefined; strong: boolean }) {
  const { value, start, strong } = props
  const delta = start === undefined ? 0 : Math.round(value * 100) - Math.round(start * 100)
  const title = start === undefined ? undefined : `Before round 1: ${pct(start)}, now ${pct(value)}`
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={title}>
      <span className={`text-accent ${strong ? 'font-semibold' : ''}`}>{pct(value)}</span>
      {start !== undefined && (
        <span
          className={`hidden w-7 text-left text-xs sm:inline-block ${delta > 0 ? 'text-win' : delta < 0 ? 'text-loss' : 'text-ink-3'}`}
        >
          {delta === 0 ? '' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`}
        </span>
      )}
    </span>
  )
}
