/**
 * Builds the pre-event ratings from the VRS prior, the cold-start rule and map stats where available.
 * Inputs: data/events/<id>/teams.json, data/teams/form/*.json, data/teams/maps/*.json (optional).
 * Output: data/ratings/current.json (+ history copy).
 * Usage: node scripts/build-ratings.ts <event-id>
 */
import { existsSync } from 'node:fs'
import {
  EventConfig,
  EventResults,
  EventTeams,
  ModelParams,
  type Ratings,
  TeamForm,
  TeamMapStats,
  type TeamRating,
} from '../data/schemas/index.ts'
import { mapStrengthFromSample, unplayedMapStrength } from '../engine/ratings/map-strength.ts'
import { priorRating } from '../engine/ratings/prior.ts'
import { readJson, repoPath } from './lib/files.ts'
import { loadRatings, saveRatings } from './lib/ratings-store.ts'

const [eventId, flag] = process.argv.slice(2)
if (!eventId) {
  console.error('Usage: node scripts/build-ratings.ts <event-id> [--force]')
  process.exit(1)
}

// Rebuilding the prior mid-event would throw away every rating update from real results. Once results
// exist, only teams missing from current.json get a prior (e.g. later-stage invites); --force rebuilds all.
const logged = readJson(repoPath('data/events', eventId, 'results.json'), EventResults).matches
  .length
const addMissingOnly = logged > 0 && flag !== '--force'

const params = readJson(repoPath('data/model/params.json'), ModelParams)
const eventTeams = readJson(repoPath('data/events', eventId, 'teams.json'), EventTeams)
const config = readJson(repoPath('data/events', eventId, 'config.json'), EventConfig)
const teams: Record<string, TeamRating> = {}

const existing = addMissingOnly ? loadRatings() : undefined
if (existing) {
  console.log(
    `${eventId} has ${logged} result(s): keeping current ratings, adding missing teams only`,
  )
  Object.assign(teams, existing.teams)
}

for (const participant of eventTeams.participants) {
  if (existing?.teams[participant.teamId]) continue
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
    for (const map of config.mapPool.map((m) => m.id)) {
      if (maps[map]) continue
      const unplayed = unplayedMapStrength(stats.overall.played, params)
      if (unplayed) maps[map] = unplayed
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
  reason: existing
    ? `added missing teams for ${eventId} (VRS prior); existing ratings kept`
    : `prior for ${eventId} (VRS + cold-start rule + map stats where available)`,
  teams,
}
saveRatings(ratings)
for (const [id, rating] of Object.entries(teams).sort((a, b) => b[1].rating - a[1].rating)) {
  console.log(
    `${id.padEnd(18)} ${rating.rating.toFixed(1)} ±${rating.rd}  maps:${Object.keys(rating.maps).length}`,
  )
}
