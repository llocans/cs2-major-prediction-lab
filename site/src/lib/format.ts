export function pct(p: number, digits = 0): string {
  if (p > 0 && p < 0.005 && digits === 0) return '<1%'
  if (p < 1 && p > 0.995 && digits === 0) return '>99%'
  return `${(p * 100).toFixed(digits)}%`
}

export function shortDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
