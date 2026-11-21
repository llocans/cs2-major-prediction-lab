import { z } from 'zod'
import { IsoDateTime } from './common.ts'

/**
 * .cache/sync-status.json: written by the poller on every run (local only, not in git), so the site
 * can show when Liquipedia was last checked and warn when the poller has stopped.
 */
export const SyncStatus = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  checkedAt: IsoDateTime,
  /** idle = no stage running today; checked = page read; error = the run failed. */
  outcome: z.enum(['idle', 'checked', 'error']),
  stageId: z.string().optional(),
  liquipediaRevid: z.number().int().optional(),
  message: z.string().optional(),
  /** Last run that logged something (results, snapshot, stage advance). */
  lastChangeAt: IsoDateTime.optional(),
  lastChange: z.string().optional(),
})
export type SyncStatus = z.infer<typeof SyncStatus>
