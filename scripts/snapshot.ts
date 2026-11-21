/**
 * Saves the pre-round snapshot for the current round of a Swiss stage (once per round).
 * Usage: node scripts/snapshot.ts <event-id> <stage-id>
 */
import { loadStageContext } from './lib/event-context.ts'
import { toRepoRelative } from './lib/files.ts'
import { saveRoundSnapshot } from './lib/snapshot.ts'

const [eventId, stageId] = process.argv.slice(2)
if (!eventId || !stageId) {
  console.error('Usage: node scripts/snapshot.ts <event-id> <stage-id>')
  process.exit(1)
}
const result = saveRoundSnapshot(loadStageContext(eventId, stageId))
const where = result.path ? ` ${toRepoRelative(result.path)}` : ''
console.log(`snapshot ${result.status}${where}`)
