/**
 * Shown while a simulation runs. Meanwhile the page sets `data-rough` and its predicted numbers turn
 * grey (theme.css); orange numbers always mean final. Nothing shows when the result came from the
 * cache.
 */
export function SimStatus({
  running,
  className = 'ml-3',
}: {
  running: boolean
  className?: string
}) {
  if (!running) return null
  return (
    <span
      className={`${className} inline-flex items-baseline gap-1.5 whitespace-nowrap text-sm`}
      role="status"
    >
      <span className="sim-pulse inline-block size-2 self-center rounded-full bg-accent" />
      <span className="font-semibold text-accent" data-keep-accent>
        Simulating…
      </span>
      <span className="text-xs text-ink-3">grey = rough</span>
    </span>
  )
}
