/**
 * One-off: finds what an event's `marketOdds` config needs from OddsPapi. Prints a summary of the
 * account's plan (free of quota; never the key or the email), CS2 tournaments that match the
 * pattern or have fixtures coming up (1 request), and the winner/moneyline markets with their
 * outcome ids (1 request). Writes nothing; the values go into data/events/<id>/config.json by hand,
 * with this run as the source.
 * Usage: node --env-file-if-exists=.env scripts/research/oddspapi-setup.ts [name-pattern]
 */
import { oddsPapiGet } from '../lib/oddspapi.ts'

const CS2_SPORT_ID = '17'
const pattern = new RegExp(process.argv[2] ?? 'pgl|singapore|major', 'i')
type Row = Record<string, unknown>
const rows = (json: unknown): Row[] =>
  Array.isArray(json) ? json.filter((r): r is Row => typeof r === 'object' && r !== null) : []

// Account: plan summary only. The response also holds the key and the email: never print those.
const account = (await oddsPapiGet('account', {})) as Row
const subscriptions = rows(account.subscriptions)
const active = subscriptions.find((s) => s.is_active === true) ?? subscriptions[0] ?? {}
const books = Object.keys((active.bookmakers as Row | undefined) ?? {}).sort()
const limits = Object.fromEntries(
  Object.entries(active).filter(([k]) => /request|limit|quota|price|valid/i.test(k)),
)
console.log('Plan:', JSON.stringify(limits))
console.log(`Bookmakers (${books.length}): ${books.join(', ')}`)

const tournaments = rows(await oddsPapiGet('tournaments', { sportId: CS2_SPORT_ID }))
const coming = (t: Row) =>
  Number(t.futureFixtures ?? 0) + Number(t.upcomingFixtures ?? 0) + Number(t.liveFixtures ?? 0)
console.log(`\nCS2 tournaments matching ${pattern} or with fixtures coming up:`)
for (const t of tournaments.filter(
  (t) => pattern.test(String(t.tournamentName)) || coming(t) > 0,
)) {
  console.log(
    `  ${t.tournamentId}  ${t.tournamentName} (${t.categoryName})  future ${t.futureFixtures}, next 24 h ${t.upcomingFixtures}, live ${t.liveFixtures}`,
  )
}

const markets = rows(await oddsPapiGet('markets', {}))
console.log('\nMarkets named winner/moneyline (pick the series winner, not a map market):')
for (const m of markets.filter(
  (m) => String(m.sportId) === CS2_SPORT_ID && /winner|moneyline/i.test(JSON.stringify(m)),
)) {
  console.log(`  ${JSON.stringify(m).slice(0, 400)}`)
}
