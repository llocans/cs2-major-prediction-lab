/**
 * Says when the numbers on screen are not final yet. While a simulation runs, the page sets
 * `data-rough` and its predicted numbers turn grey (theme.css); orange always means final.
 */
export function SimStatus({ running }: { running: boolean }) {
  if (!running) return null
  return (
    <span className="text-ink-2" role="status">
      {' '}
      · <span className="font-semibold">rough estimate</span> (grey), final odds in a few seconds
    </span>
  )
}
