/**
 * Fixed geometry for the Swiss bracket. Group sizes follow from the format, so every box has its
 * final height before pairings are known and the layout never jumps as rounds fill in.
 */
export const LAYOUT = {
  columnWidth: 176,
  columnGap: 28,
  headerHeight: 22,
  matchHeight: 46,
  matchGap: 6,
  groupGap: 18,
  groupPadding: 6,
  top: 28,
}

export interface GroupSlot {
  round: number
  wins: number
  losses: number
  size: number
  x: number
  y: number
  height: number
}

/** Expected group sizes per round for a Swiss stage (e.g. 16 teams: R3 = 4/8/4). */
export function groupSlots(
  teamCount: number,
  rounds: number,
  winsToAdvance: number,
  lossesToEliminate: number,
): GroupSlot[] {
  const slots: GroupSlot[] = []
  let groups = new Map<string, number>([['0-0', teamCount]])
  for (let round = 1; round <= rounds; round++) {
    const ordered = [...groups.entries()]
      .map(([key, size]) => {
        const [w = 0, l = 0] = key.split('-').map(Number)
        return { wins: w, losses: l, size }
      })
      .sort((a, b) => b.wins - b.losses - (a.wins - a.losses))
    let y = LAYOUT.top
    const x = (round - 1) * (LAYOUT.columnWidth + LAYOUT.columnGap)
    const next = new Map<string, number>()
    for (const group of ordered) {
      const matches = group.size / 2
      const height =
        LAYOUT.headerHeight +
        LAYOUT.groupPadding * 2 +
        matches * LAYOUT.matchHeight +
        (matches - 1) * LAYOUT.matchGap
      slots.push({ round, ...group, x, y, height })
      y += height + LAYOUT.groupGap
      const add = (w: number, l: number) => {
        if (w >= winsToAdvance || l >= lossesToEliminate) return
        const key = `${w}-${l}`
        next.set(key, (next.get(key) ?? 0) + matches)
      }
      add(group.wins + 1, group.losses)
      add(group.wins, group.losses + 1)
    }
    groups = next
  }
  return slots
}

export function bracketSize(slots: readonly GroupSlot[]): { width: number; height: number } {
  const width = Math.max(...slots.map((s) => s.x)) + LAYOUT.columnWidth
  const height = Math.max(...slots.map((s) => s.y + s.height)) + 8
  return { width, height }
}
