import type { TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { pct } from '../lib/format.ts'

interface Props {
  teams: TeamOutlook[]
  selected?: string
  name: (teamId: string) => string
  /** Each team's chance to advance before the stage's first round (from its snapshot). */
  start?: Map<string, number>
  onSelect: (teamId: string) => void
  /** Formats whose veto is assumed, not verified, in the playoff and title odds (e.g. ["bo5"]). */
  unverifiedVeto?: readonly string[]
}

const eventColumns: Array<{ key: 'pPlayoffs' | 'pTitle'; label: string; title: string }> = [
  { key: 'pPlayoffs', label: 'Playoffs', title: 'Reaches the playoffs (whole-event simulation)' },
  { key: 'pTitle', label: 'Title', title: 'Wins the Major (whole-event simulation)' },
]

const columns: Array<{ key: 'p30' | 'pAdvance' | 'p03'; label: string; title: string }> = [
  { key: 'p30', label: '3-0', title: 'Advances without a loss' },
  { key: 'pAdvance', label: 'Advance', title: 'Reaches 3 wins' },
  { key: 'p03', label: '0-3', title: 'Eliminated without a win' },
]

export function OddsTable({ teams, selected, name, start, onSelect, unverifiedVeto = [] }: Props) {
  const sorted = [...teams].sort((a, b) => b.pAdvance - a.pAdvance || b.p30 - a.p30)
  const assumed = unverifiedVeto.length > 0
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-left font-display text-xs uppercase tracking-wider text-ink-2">
            <th className="py-1.5 pr-2 font-semibold">Team</th>
            <th className="px-2 py-1.5 text-right font-semibold">Rec</th>
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-2 py-1.5 text-right font-semibold"
                title={column.title}
              >
                {column.label}
              </th>
            ))}
            {eventColumns.map((column, index) => (
              <th
                key={column.key}
                className={`hidden py-1.5 text-right font-semibold sm:table-cell ${index === eventColumns.length - 1 ? 'pl-2' : 'px-2'}`}
                title={column.title}
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
              <td className="py-1.5 pr-2">
                <span className={selected === team.teamId ? 'font-semibold' : ''}>
                  {name(team.teamId)}
                </span>
                {team.confidence === 'low' && (
                  <span className="ml-1.5 text-[11px] uppercase tracking-wider text-ink-3">
                    low conf.
                  </span>
                )}
              </td>
              <td className="num px-2 py-1.5 text-right text-ink-2">{team.record}</td>
              {columns.map((column) => (
                <td key={column.key} className="num px-2 py-1.5 text-right">
                  {column.key === 'pAdvance' ? (
                    <Advance value={team.pAdvance} start={start?.get(team.teamId)} />
                  ) : (
                    <span className="text-accent">{pct(team[column.key])}</span>
                  )}
                </td>
              ))}
              {eventColumns.map((column, index) => {
                const value = team[column.key]
                return (
                  <td
                    key={column.key}
                    className={`num hidden py-1.5 text-right sm:table-cell ${index === eventColumns.length - 1 ? 'pl-2' : 'px-2'} ${value === undefined ? 'text-ink-3' : 'text-ink-2'}`}
                  >
                    {value === undefined ? '–' : pct(value)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {assumed && (
        <p className="hidden text-xs text-ink-3 sm:block">
          * The final is {unverifiedVeto.join('/').toUpperCase()} (confirmed). Its map ban/pick
          order is not published yet, so title odds use an assumed order.
        </p>
      )}
    </div>
  )
}

/** Chance to advance and how many points it moved since round 1 (shown from 1 point up). */
function Advance({ value, start }: { value: number; start: number | undefined }) {
  const delta = start === undefined ? 0 : Math.round(value * 100) - Math.round(start * 100)
  const title = start === undefined ? undefined : `Before round 1: ${pct(start)}, now ${pct(value)}`
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={title}>
      <span className="font-semibold text-accent">{pct(value)}</span>
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
