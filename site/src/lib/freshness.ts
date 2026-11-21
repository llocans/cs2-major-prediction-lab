import type { SyncStatus } from '../../../data/schemas/sync.ts'

export const POLL_MINUTES = 10
/** Two missed runs plus slack: beyond this during a stage, something is wrong. */
export const STALE_MINUTES = 25

export type FreshnessState = 'live' | 'stale' | 'idle' | 'error' | 'unknown'

export interface Freshness {
  state: FreshnessState
  /** Minutes since the poller last ran, if known. */
  checkedAgo?: number
  message: string
}

const DAY = 86_400_000

/** True while the poller is expected to run for this stage (its dates ±1 day, like the poller). */
export function inStageWindow(now: number, start: string, end: string): boolean {
  return now >= Date.parse(start) - DAY && now < Date.parse(end) + 2 * DAY
}

export function minutesAgo(now: number, iso: string): number {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
}

export function formatAgo(minutes: number): string {
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ${minutes % 60} min ago`
  return `${Math.floor(hours / 24)} days ago`
}

/** Plain-language status of the automatic result fetching for one stage. */
export function freshness(
  now: number,
  sync: SyncStatus | undefined,
  stage: { start: string; end: string },
): Freshness {
  const live = inStageWindow(now, stage.start, stage.end)
  if (!sync) {
    return {
      state: 'unknown',
      message: 'No poller status on this machine (the poller has not run here yet).',
    }
  }
  const checkedAgo = minutesAgo(now, sync.checkedAt)
  if (sync.outcome === 'error') {
    return {
      state: 'error',
      checkedAgo,
      message: `Last Liquipedia check failed ${formatAgo(checkedAgo)}: ${sync.message ?? 'unknown error'}`,
    }
  }
  if (live && checkedAgo > STALE_MINUTES) {
    return {
      state: 'stale',
      checkedAgo,
      message: `No Liquipedia check for ${formatAgo(checkedAgo).replace(' ago', '')}. Is the Mac awake and the poller running?`,
    }
  }
  if (!live) {
    const opens = new Date(Date.parse(stage.start) - DAY).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
    return {
      state: 'idle',
      checkedAgo,
      message:
        now < Date.parse(stage.start)
          ? `Poller idle until ${opens}; last run ${formatAgo(checkedAgo)}.`
          : `Stage over; poller last ran ${formatAgo(checkedAgo)}.`,
    }
  }
  const next = Math.max(0, POLL_MINUTES - checkedAgo)
  return {
    state: 'live',
    checkedAgo,
    message: `Liquipedia checked ${formatAgo(checkedAgo)} · next check ${next === 0 ? 'any moment' : `in ~${next} min`}.`,
  }
}
