import { existsSync } from 'node:fs'
import { Ratings } from '../../data/schemas/index.ts'
import { readJson, repoPath, writeJson } from './files.ts'

const CURRENT = repoPath('data/ratings/current.json')

export function loadRatings(): Ratings {
  if (!existsSync(CURRENT)) {
    throw new Error(
      'data/ratings/current.json is missing. Run node scripts/build-ratings.ts first.',
    )
  }
  return readJson(CURRENT, Ratings)
}

/** Writes current.json and an immutable copy in history/ named by asOf. */
export function saveRatings(ratings: Ratings): void {
  writeJson(CURRENT, Ratings, ratings)
  const stamp = ratings.asOf.replaceAll(/[:.]/g, '-')
  writeJson(repoPath('data/ratings/history', `${stamp}.json`), Ratings, ratings, {
    exclusive: true,
  })
}
