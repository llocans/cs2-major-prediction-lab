/**
 * Validates every data file against its schema and checks cross-file references.
 * Usage: npm run validate
 */
import { globSync } from 'node:fs'
import { EventTeams, schemaForPath, TeamRegistry } from '../data/schemas/index.ts'
import { DataError, readJson, repoPath, repoRoot } from './lib/files.ts'

const problems: string[] = []
let checked = 0

for (const relativePath of globSync('data/**/*.json', { cwd: repoRoot })) {
  const schema = schemaForPath(relativePath)
  if (!schema) {
    problems.push(`${relativePath}: no schema registered in data/schemas/index.ts`)
    continue
  }
  try {
    readJson(repoPath(relativePath), schema)
    checked++
  } catch (error) {
    if (!(error instanceof DataError)) throw error
    problems.push(error.message)
  }
}

// Cross-file check: every event participant exists in the team registry.
try {
  const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
  const known = new Set(registry.teams.map((team) => team.id))
  for (const teamsFile of globSync('data/events/*/teams.json', { cwd: repoRoot })) {
    const eventTeams = readJson(repoPath(teamsFile), EventTeams)
    for (const participant of eventTeams.participants) {
      if (!known.has(participant.teamId)) {
        problems.push(`${teamsFile}: unknown teamId "${participant.teamId}"`)
      }
    }
  }
} catch (error) {
  if (!(error instanceof DataError)) throw error
  problems.push(error.message)
}

if (problems.length > 0) {
  console.error(`Validation failed (${problems.length} problem(s)):\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`OK: ${checked} data files valid`)
