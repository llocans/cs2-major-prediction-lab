import type { SyncStatus } from '../../../data/schemas/sync.ts'

/** The cloud poller runs every 15 minutes during match hours (.github/workflows/poll.yml). */
export const POLL_MINUTES = 15
/**
 * Beyond this during a stage something is wrong: a 15-minute schedule, GitHub starting runs up to
 * ~15 minutes late, and this Mac syncing every 10 minutes.
 */
export const STALE_MINUTES = 45

export type FreshnessState = 'live' | 'waiting' | 'problem'

export interface Freshness {
  state: FreshnessState
  /** One word for the eye: Live, Waiting or Problem. */
  label: string
  /** One short sentence with the detail. */
  detail: string
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

const dayMonth = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Plain-language status of the automatic result fetching for one stage. */
export function freshness(
  now: number,
  sync: SyncStatus | undefined,
  stage: { start: string; end: string },
): Freshness {
  const live = inStageWindow(now, stage.start, stage.end)
  const before = now < Date.parse(stage.start) - DAY

  if (sync?.outcome === 'error') {
    return {
      state: 'problem',
      label: 'Problem',
      detail: `The last automatic check failed ${formatAgo(minutesAgo(now, sync.checkedAt))}: ${sync.message ?? 'unknown error'}. Odds may be out of date.`,
    }
  }
  if (!live) {
    return {
      state: 'waiting',
      label: 'Waiting',
      detail: before
        ? `Automatic result checks start ${dayMonth(Date.parse(stage.start) - DAY)}.`
        : 'Stage finished. Results are final.',
    }
  }
  if (!sync) {
    return {
      state: 'problem',
      label: 'Problem',
      detail: 'No automatic check has reached this computer yet. Odds may be out of date.',
    }
  }
  const ago = minutesAgo(now, sync.checkedAt)
  if (ago > STALE_MINUTES) {
    return {
      state: 'problem',
      label: 'Problem',
      detail: `No update for ${formatAgo(ago).replace(' ago', '')}. Odds may be out of date.`,
    }
  }
  const next = Math.max(0, POLL_MINUTES - ago)
  return {
    state: 'live',
    label: 'Live',
    detail: `Results checked ${formatAgo(ago)}, next check ${next === 0 ? 'any moment' : `in about ${next} min`}.`,
  }
}
