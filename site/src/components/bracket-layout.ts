/**
 * Fixed geometry for the Swiss bracket. Group sizes follow from the format, so every box has its
 * final height before pairings are known and the layout never jumps as rounds fill in.
 *
 * Each round is a column. A column holds that round's groups (best record on top) and, where a
 * record is final (e.g. 3-0 after round 3), a result box: advanced on top, eliminated at the bottom.
 * Records that become final after the last round (3-2, 2-3) share the last column with the records
 * one round earlier (3-1, 1-3), so the bracket needs no extra column. Items in a column are spread
 * over the full bracket height, which keeps the connectors between columns short.
 */
export const LAYOUT = {
  columnWidth: 212,
  /** Room for the short arrow pair after each group. */
  columnGap: 40,
  /** A group panel's header strip: record, format and tag. */
  headerHeight: 28,
  /** Space between a panel's edge and its match cards. */
  panelPadding: 8,
  matchHeight: 54,
  matchGap: 8,
  /** Smallest gap between two items in a column. */
  groupGap: 28,
  /** Space for the "Round 1" labels. */
  top: 28,
  /** Result boxes: the "Advanced"/"Eliminated" label plus a record label per column. */
  resultHeader: 46,
  resultRow: 28,
  resultPadding: 8,
}

export interface GroupSlot {
  kind: 'group'
  round: number
  wins: number
  losses: number
  size: number
  x: number
  y: number
  height: number
}

export interface ResultSlot {
  kind: 'result'
  /** The column (round) the box is drawn in. */
  round: number
  outcome: 'advanced' | 'eliminated'
  /** Final records in this box, one column each, with how many teams end on each. */
  records: Array<{ wins: number; losses: number; size: number }>
  x: number
  y: number
  height: number
}

export type Slot = GroupSlot | ResultSlot

interface Item {
  slot: Omit<GroupSlot, 'x' | 'y'> | Omit<ResultSlot, 'x' | 'y'>
  order: number
}

/** Teams per result-box column: one record per column, or two columns for a single record. */
export function resultColumns(slot: Pick<ResultSlot, 'records'>): number {
  return Math.max(slot.records.length, 2)
}

function resultHeight(records: ResultSlot['records']): number {
  const columns = resultColumns({ records })
  const rows =
    records.length >= 2
      ? Math.max(...records.map((r) => r.size))
      : Math.ceil((records[0]?.size ?? 0) / columns)
  return LAYOUT.resultHeader + rows * LAYOUT.resultRow + LAYOUT.resultPadding
}

function groupHeight(teams: number): number {
  const matches = teams / 2
  return (
    LAYOUT.headerHeight +
    2 * LAYOUT.panelPadding +
    matches * LAYOUT.matchHeight +
    (matches - 1) * LAYOUT.matchGap
  )
}

/** Group and result slots for a Swiss stage (e.g. 16 teams: R3 = 4/8/4, then 3-0 and 0-3 boxes). */
export function bracketSlots(
  teamCount: number,
  rounds: number,
  winsToAdvance: number,
  lossesToEliminate: number,
): Slot[] {
  const columns: Item[][] = Array.from({ length: rounds }, () => [])
  const finals: Array<{ wins: number; losses: number; size: number; after: number }> = []

  let groups = new Map<string, number>([['0-0', teamCount]])
  for (let round = 1; round <= rounds; round++) {
    const next = new Map<string, number>()
    for (const [key, size] of groups) {
      const [wins = 0, losses = 0] = key.split('-').map(Number)
      columns[round - 1]?.push({
        slot: { kind: 'group', round, wins, losses, size, height: groupHeight(size) },
        order: losses - wins,
      })
      const add = (w: number, l: number) => {
        if (w >= winsToAdvance || l >= lossesToEliminate) {
          const final = finals.find((f) => f.wins === w && f.losses === l)
          if (final) final.size += size / 2
          else finals.push({ wins: w, losses: l, size: size / 2, after: round })
          return
        }
        const k = `${w}-${l}`
        next.set(k, (next.get(k) ?? 0) + size / 2)
      }
      add(wins + 1, losses)
      add(wins, losses + 1)
    }
    groups = next
  }

  for (const outcome of ['advanced', 'eliminated'] as const) {
    const byColumn = new Map<number, ResultSlot['records']>()
    for (const f of finals) {
      if (f.wins >= winsToAdvance !== (outcome === 'advanced')) continue
      const column = Math.min(f.after + 1, rounds)
      byColumn.set(column, [...(byColumn.get(column) ?? []), f])
    }
    for (const [round, records] of byColumn) {
      // Fewest losses first among advanced (3-1, 3-2), most wins last among eliminated (1-3, 2-3).
      records.sort((a, b) => a.losses - b.losses || a.wins - b.wins)
      columns[round - 1]?.push({
        slot: {
          kind: 'result',
          round,
          outcome,
          records: records.map(({ wins, losses, size }) => ({ wins, losses, size })),
          height: resultHeight(records),
        },
        order: outcome === 'advanced' ? -Infinity : Infinity,
      })
    }
  }

  const natural = columns.map((items) =>
    items.reduce((sum, item, i) => sum + item.slot.height + (i > 0 ? LAYOUT.groupGap : 0), 0),
  )
  const inner = Math.max(...natural)

  return columns.flatMap((items, index) => {
    const sorted = [...items].sort((a, b) => a.order - b.order)
    const total = sorted.reduce((sum, item) => sum + item.slot.height, 0)
    const gap = sorted.length > 1 ? (inner - total) / (sorted.length - 1) : 0
    // A column with one item (round 1) starts at the top, right under its "Round" label.
    let y = LAYOUT.top
    const x = index * (LAYOUT.columnWidth + LAYOUT.columnGap)
    return sorted.map((item) => {
      const slot = { ...item.slot, x, y } as Slot
      y += item.slot.height + gap
      return slot
    })
  })
}

export function bracketSize(slots: readonly Slot[]): { width: number; height: number } {
  const width = Math.max(...slots.map((s) => s.x)) + LAYOUT.columnWidth
  const height = Math.max(...slots.map((s) => s.y + s.height)) + 8
  return { width, height }
}
