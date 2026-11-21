/**
 * Saves the pre-round snapshot for the current round of a Swiss stage (once per round) and refreshes
 * data/events/<id>/status.md. Uses the same decision as the poller (scripts/lib/log-results.ts).
 * Usage: node scripts/snapshot.ts <event-id> <stage-id>
 */
import { ensureRoundSnapshot } from './lib/log-results.ts'

const [eventId, stageId] = process.argv.slice(2)
if (!eventId || !stageId) {
  console.error('Usage: node scripts/snapshot.ts <event-id> <stage-id>')
  process.exit(1)
}
console.log(`snapshot ${ensureRoundSnapshot(eventId, stageId)}`)
