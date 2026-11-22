import type { TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { pct } from '../lib/format.ts'

interface Props {
  teams: TeamOutlook[]
  selected?: string
  name: (teamId: string) => string
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

export function OddsTable({ teams, selected, name, onSelect, unverifiedVeto = [] }: Props) {
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
                  <Probability value={team[column.key]} strong={column.key === 'pAdvance'} />
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
          * Title odds use a {unverifiedVeto.join('/').toUpperCase()} veto procedure that is not yet
          confirmed for this event (see docs/rules.md).
        </p>
      )}
    </div>
  )
}

function Probability({ value, strong }: { value: number; strong: boolean }) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {strong && (
        <span className="hidden h-1 w-12 bg-paper-2 sm:inline-block" aria-hidden="true">
          <span className="block h-1 bg-accent" style={{ width: `${Math.round(value * 100)}%` }} />
        </span>
      )}
      <span className={strong ? 'font-semibold text-accent' : 'text-accent'}>{pct(value)}</span>
    </span>
  )
}
