export function pct(p: number, digits = 0): string {
  if (p > 0 && p < 0.005 && digits === 0) return '<1%'
  if (p < 1 && p > 0.995 && digits === 0) return '>99%'
  return `${(p * 100).toFixed(digits)}%`
}

export function shortDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * False when a W-L record already rules out a flawless outcome: "3-0" needs no losses yet, "0-3" no
 * wins. Its chance is then exactly 0 and shown as "–", not as a prediction.
 */
export function outcomeOpen(record: string, outcome: '3-0' | '0-3'): boolean {
  const [wins = 0, losses = 0] = record.split('-').map(Number)
  return outcome === '3-0' ? losses === 0 : wins === 0
}

/** Where a W-L record leaves a team in a Swiss stage: through, out, or still playing. */
export function recordStatus(
  record: string,
  winsToAdvance: number,
  lossesToEliminate: number,
): 'advanced' | 'eliminated' | 'playing' {
  const [wins = 0, losses = 0] = record.split('-').map(Number)
  if (wins >= winsToAdvance) return 'advanced'
  if (losses >= lossesToEliminate) return 'eliminated'
  return 'playing'
}
