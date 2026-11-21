import { useEffect, useState } from 'react'
import type { SyncStatus } from '../../../data/schemas/sync.ts'
import { formatAgo, freshness, minutesAgo } from '../lib/freshness.ts'

interface Props {
  sync: SyncStatus | undefined
  stage: { start: string; end: string }
  /** When ratings last changed (a logged result or a rebuild). */
  ratingsAsOf: string
}

/** One line near the bracket: is the data fresh, and is the automatic fetching alive? */
export function FreshnessBar({ sync, stage, ratingsAsOf }: Props) {
  const now = useNow(30_000)
  const status = freshness(now, sync, stage)
  const alert = status.state === 'stale' || status.state === 'error'
  const markColor = alert ? 'bg-loss' : status.state === 'live' ? 'bg-win' : 'bg-ink-3'
  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div
      className={`num flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border px-3 py-2 text-xs ${
        alert ? 'border-loss text-loss' : 'border-rule text-ink-2'
      }`}
      role={alert ? 'alert' : 'status'}
    >
      <span className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-sm ${markColor}`} aria-hidden="true" />
        <span className={alert ? 'font-semibold' : ''}>{status.message}</span>
      </span>
      {sync?.lastChangeAt && (
        <span>
          Last change {formatAgo(minutesAgo(now, sync.lastChangeAt))}
          {sync.lastChange && <span className="text-ink-3"> ({sync.lastChange})</span>}
        </span>
      )}
      <span className="text-ink-3">Ratings as of {when(ratingsAsOf)}</span>
    </div>
  )
}

/** Current time, re-rendered every `intervalMs` so "x min ago" stays true. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
