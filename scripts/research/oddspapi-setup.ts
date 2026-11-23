/**
 * One-off: finds what an event's `marketOdds` config needs from OddsPapi. Prints the account's plan
 * (free of quota), the CS2 tournaments whose name matches the pattern (1 request) and the
 * match-winner markets with their outcome ids (1 request). Writes nothing; the values go into
 * data/events/<id>/config.json by hand, with this run as the source.
 * Usage: node --env-file-if-exists=.env scripts/research/oddspapi-setup.ts [name-pattern]
 */
import { oddsPapiGet } from '../lib/oddspapi.ts'

const CS2_SPORT_ID = '17'
const pattern = new RegExp(process.argv[2] ?? 'pgl|singapore', 'i')

const account = await oddsPapiGet('account', {})
console.log('Account (plan, request limit, bookmakers):')
console.log(JSON.stringify(account, null, 2).slice(0, 3000))

const tournaments = await oddsPapiGet('tournaments', { sportId: CS2_SPORT_ID })
const found = Array.isArray(tournaments)
  ? tournaments.filter((t) => pattern.test(JSON.stringify(t)))
  : tournaments
console.log(`\nCS2 tournaments matching ${pattern}:`)
console.log(JSON.stringify(found, null, 2).slice(0, 4000))

const markets = await oddsPapiGet('markets', {})
const winner = Array.isArray(markets)
  ? markets.filter((m) => /\b(171|178077)\b|winner/i.test(JSON.stringify(m)))
  : markets
console.log('\nWinner markets (ids 171 / 178077 or named "winner"):')
console.log(JSON.stringify(winner, null, 2).slice(0, 6000))
