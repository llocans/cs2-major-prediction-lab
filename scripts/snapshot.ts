/**
 * Saves the pre-round snapshot for the current round of a Swiss stage (once per round) and refreshes
 * data/events/<id>/status.md. Uses the same decision as the poller (scripts/lib/log-results.ts):
 * from round 2 it waits for the round's full draw (stored in draw.json by the poller) and reports
 * "waiting"; `--engine-draw` saves now, with the engine's pairing for what is not announced.
 * Usage: node scripts/snapshot.ts <event-id> <stage-id> [--engine-draw]
 */
import { ensureRoundSnapshot } from './lib/log-results.ts'

const args = process.argv.slice(2)
const [eventId, stageId] = args.filter((arg) => !arg.startsWith('--'))
if (!eventId || !stageId) {
  console.error('Usage: node scripts/snapshot.ts <event-id> <stage-id> [--engine-draw]')
  process.exit(1)
}
const force = args.includes('--engine-draw')
console.log(`snapshot ${ensureRoundSnapshot(eventId, stageId, undefined, { force })}`)
