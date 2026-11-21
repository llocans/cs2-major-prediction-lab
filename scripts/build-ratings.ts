/**
 * Builds the pre-event ratings from the VRS prior, the cold-start rule and map stats where available.
 * Inputs: data/events/<id>/teams.json, data/teams/form/*.json, data/teams/maps/*.json (optional).
 * Output: data/ratings/current.json (+ history copy).
 * Usage: node scripts/build-ratings.ts <event-id>
 */
import { existsSync } from 'node:fs'
import {
  EventTeams,
  ModelParams,
  type Ratings,
  TeamForm,
  TeamMapStats,
  type TeamRating,
} from '../data/schemas/index.ts'
import { mapStrengthFromSample } from '../engine/ratings/map-strength.ts'
import { priorRating } from '../engine/ratings/prior.ts'
import { readJson, repoPath } from './lib/files.ts'
import { saveRatings } from './lib/ratings-store.ts'

const eventId = process.argv[2]
if (!eventId) {
  console.error('Usage: node scripts/build-ratings.ts <event-id>')
  process.exit(1)
}

const params = readJson(repoPath('data/model/params.json'), ModelParams)
const eventTeams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
const teams: Record<string, TeamRating> = {}

for (const participant of eventTeams.participants) {
  const formPath = repoPath('data/teams/form', `${participant.teamId}.json`)
  if (!existsSync(formPath))
    throw new Error(`Missing ${formPath}. Run scripts/research/vrs-form.ts`)
  const form = readJson(formPath, TeamForm)
  const vrsPoints = participant.vrsPoints ?? form.vrs.points
  const prior = priorRating({ vrsPoints, tier1Series: form.summary.tier1Series }, params)

  const sources = [form.source]
  const maps: TeamRating['maps'] = {}
  const mapsPath = repoPath('data/teams/maps', `${participant.teamId}.json`)
  if (existsSync(mapsPath)) {
    const stats = readJson(mapsPath, TeamMapStats)
    for (const [map, record] of Object.entries(stats.maps)) {
      maps[map] = mapStrengthFromSample(
        { won: record.won, played: record.played },
        { won: stats.overall.won, played: stats.overall.played },
        params,
      )
    }
    sources.push(stats.source)
  }
  teams[participant.teamId] = {
    rating: Math.round(prior.rating * 10) / 10,
    rd: prior.rd,
    maps,
    sources,
  }
}

const ratings: Ratings = {
  schemaVersion: 1,
  asOf: new Date().toISOString(),
  reason: `prior for ${eventId} (VRS + cold-start rule + map stats where available)`,
  teams,
}
saveRatings(ratings)
for (const [id, rating] of Object.entries(teams).sort((a, b) => b[1].rating - a[1].rating)) {
  console.log(
    `${id.padEnd(18)} ${rating.rating.toFixed(1)} ±${rating.rd}  maps:${Object.keys(rating.maps).length}`,
  )
}
