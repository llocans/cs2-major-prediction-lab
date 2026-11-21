import { useEffect, useState } from 'react'
import type { SyncStatus } from '../../../data/schemas/sync.ts'
import { formatAgo, freshness, minutesAgo } from '../lib/freshness.ts'

interface Props {
  sync: SyncStatus | undefined
  stage: { start: string; end: string }
  /** When ratings last changed (a logged result or a rebuild). */
  ratingsAsOf: string
}

const STYLE = {
  live: { box: 'border-rule', mark: 'bg-win', word: 'text-win' },
  waiting: { box: 'border-rule', mark: 'bg-ink-3', word: 'text-ink-2' },
  problem: { box: 'border-loss', mark: 'bg-loss', word: 'text-loss' },
} as const

/**
 * Are these numbers current? One word you can read at a glance (Live, Waiting, Problem), one sentence
 * of detail, and a quieter second line with the last new result and the ratings time.
 */
export function FreshnessBar({ sync, stage, ratingsAsOf }: Props) {
  const now = useNow(30_000)
  const status = freshness(now, sync, stage)
  const style = STYLE[status.state]
  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div
      className={`num flex flex-col gap-0.5 rounded-sm border px-3 py-2 ${style.box}`}
      role={status.state === 'problem' ? 'alert' : 'status'}
    >
      <p className="flex items-baseline gap-2 text-sm">
        <span
          className={`inline-block h-2 w-2 shrink-0 self-center rounded-sm ${style.mark}`}
          aria-hidden="true"
        />
        <span className={`font-display text-base font-bold uppercase tracking-wider ${style.word}`}>
          {status.label}
        </span>
        <span className="text-ink-2">{status.detail}</span>
      </p>
      <p className="pl-4 text-xs text-ink-3">
        {sync?.lastChangeAt
          ? `Last new data ${formatAgo(minutesAgo(now, sync.lastChangeAt))}${sync.lastChange ? ` (${sync.lastChange})` : ''} · `
          : ''}
        Team ratings as of {when(ratingsAsOf)}
      </p>
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
