import { pct } from '../lib/format.ts'

export interface PlayoffOddsRow {
  teamId: string
  /** Seed in the playoffs, or the stage the team starts in (projected view). */
  tag: string
  values: Array<number | undefined>
  /** Tooltip with the reason behind the numbers. */
  reason?: string
}

interface Props {
  columns: Array<{ label: string; title: string; strong?: boolean }>
  rows: PlayoffOddsRow[]
  tagLabel: string
  name: (teamId: string) => string
  /** Footnote, e.g. an unverified veto. Marks the strong column with a "*". */
  note?: string
}

/** A compact odds table: team, a tag column, then probability columns (rows pre-sorted). */
export function PlayoffOddsTable({ columns, rows, tagLabel, name, note }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-left font-display text-xs uppercase tracking-wider text-ink-2">
            <th className="py-1.5 pr-2 font-semibold">Team</th>
            <th className="px-2 py-1.5 text-right font-semibold">{tagLabel}</th>
            {columns.map((column) => (
              <th
                key={column.label}
                className="px-2 py-1.5 text-right font-semibold last:pr-0"
                title={column.title}
              >
                {column.label}
                {column.strong && note ? <span aria-hidden="true">*</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.teamId} className="border-b border-rule" title={row.reason}>
              <td className="py-1.5 pr-2">{name(row.teamId)}</td>
              <td className="num px-2 py-1.5 text-right text-ink-2">{row.tag}</td>
              {row.values.map((value, index) => {
                const column = columns[index]
                return (
                  <td
                    key={column?.label ?? index}
                    className={`num px-2 py-1.5 text-right last:pr-0 ${value === undefined ? 'text-ink-3' : column?.strong ? 'font-semibold text-accent' : 'text-accent'}`}
                  >
                    {value === undefined ? '–' : pct(value)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="text-xs text-ink-3">* {note}</p>}
    </div>
  )
}
