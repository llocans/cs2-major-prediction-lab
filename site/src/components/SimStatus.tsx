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
      className={`${className} inline-flex items-baseline gap-1.5 whitespace-nowrap text-base`}
      role="status"
    >
      <span className="sim-pulse inline-block size-2.5 self-center rounded-full bg-accent" />
      <span className="font-semibold text-accent" data-keep-accent>
        Simulating changes…
      </span>
    </span>
  )
}
