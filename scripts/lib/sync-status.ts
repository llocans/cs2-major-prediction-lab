import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { SyncStatus } from '../../data/schemas/sync.ts'
import { repoPath } from './files.ts'

const FILE = repoPath('.cache/sync-status.json')

function previous(): SyncStatus | undefined {
  if (!existsSync(FILE)) return undefined
  const parsed = SyncStatus.safeParse(JSON.parse(readFileSync(FILE, 'utf8')))
  return parsed.success ? parsed.data : undefined
}

/** Records this poller run. Keeps the last change from earlier runs when nothing changed now. */
export function writeSyncStatus(
  status: Omit<SyncStatus, 'schemaVersion' | 'checkedAt' | 'lastChangeAt' | 'lastChange'>,
  change?: string,
): void {
  const now = new Date().toISOString()
  const before = previous()
  const next: SyncStatus = { schemaVersion: 1, checkedAt: now, ...status }
  if (change) {
    next.lastChangeAt = now
    next.lastChange = change
  } else if (before?.lastChangeAt) {
    next.lastChangeAt = before.lastChangeAt
    if (before.lastChange) next.lastChange = before.lastChange
  }
  mkdirSync(repoPath('.cache'), { recursive: true })
  writeFileSync(FILE, `${JSON.stringify(SyncStatus.parse(next), null, 2)}\n`)
}
