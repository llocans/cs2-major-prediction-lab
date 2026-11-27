import { useEffect, useState } from 'react'
import type { SyncStatus } from '../../../data/schemas/sync.ts'
import { formatAgo, freshness, minutesAgo } from '../lib/freshness.ts'

interface Props {
  sync: SyncStatus | undefined
  stage: { start: string; end: string }
  /** When ratings last changed (a logged result or a rebuild). */
  ratingsAsOf: string
  /** Set on a finished stage: when its odds were locked. */
  lockedAt?: string
}

const STYLE = {
  live: { box: 'border-rule', mark: 'bg-win', word: 'text-win' },
  waiting: { box: 'border-rule', mark: 'bg-ink-3', word: 'text-ink-2' },
  problem: { box: 'border-loss', mark: 'bg-loss', word: 'text-loss' },
  final: { box: 'border-rule', mark: 'bg-ink', word: 'text-ink' },
} as const

/**
 * Are these numbers current? One word you can read at a glance (Live, Waiting, Problem), one sentence
 * of detail, and a quieter second line with the last new result and the ratings time.
 */
export function FreshnessBar({ sync, stage, ratingsAsOf, lockedAt }: Props) {
  const now = useNow(30_000)
  const status = freshness(now, sync, stage, lockedAt !== undefined)
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
          className={`mt-2 inline-block h-2 w-2 shrink-0 self-start rounded-sm ${style.mark}`}
          aria-hidden="true"
        />
        <span className={`font-display text-base font-bold uppercase tracking-wider ${style.word}`}>
          {status.label}
        </span>
        <span className="text-ink-2">{status.detail}</span>
      </p>
      <p className="pl-4 text-xs text-ink-3">
        {lockedAt ? (
          `Odds locked ${when(lockedAt)}, after the last match`
        ) : (
          <>
            {sync?.lastChangeAt
              ? `Last new data ${formatAgo(minutesAgo(now, sync.lastChangeAt))}${sync.lastChange ? ` (${sync.lastChange})` : ''} · `
              : ''}
            Team ratings last updated {when(ratingsAsOf)} · they update after each match
          </>
        )}
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
