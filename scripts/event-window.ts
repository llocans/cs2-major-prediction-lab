/**
 * Exit code 0 if the event is in its keep-alive window today (see scripts/lib/event-window.ts),
 * 1 if not. Used by .github/poll-loop.sh to decide whether an idle poll ends the chain.
 * Usage: node scripts/event-window.ts <event-id>
 */
import { EventConfig } from '../data/schemas/index.ts'
import { isEventWindowOpen } from './lib/event-window.ts'
import { readJson, repoPath } from './lib/files.ts'

const [eventId] = process.argv.slice(2)
if (!eventId) {
  console.error('Usage: node scripts/event-window.ts <event-id>')
  process.exit(2)
}
const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
const today = new Date().toISOString().slice(0, 10)
const open = isEventWindowOpen(config.stages, today)
console.log(`${eventId}: event window ${open ? 'open' : 'closed'} on ${today}`)
process.exit(open ? 0 : 1)
