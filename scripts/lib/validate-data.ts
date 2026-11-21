import { globSync } from 'node:fs'
import { EventTeams, schemaForPath, TeamRegistry } from '../../data/schemas/index.ts'
import { DataError, readJson, repoPath, repoRoot } from './files.ts'

/** Validates every data file and cross-file references. Returns the problems found (empty = valid). */
export function validateAllData(): { checked: number; problems: string[] } {
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

  try {
    const registry = readJson(repoPath('data/teams/registry.json'), TeamRegistry)
    const known = new Set(registry.teams.map((team) => team.id))
    for (const teamsFile of globSync('data/events/*/teams.json', { cwd: repoRoot })) {
      for (const participant of readJson(repoPath(teamsFile), EventTeams).participants) {
        if (!known.has(participant.teamId)) {
          problems.push(`${teamsFile}: unknown teamId "${participant.teamId}"`)
        }
      }
    }
  } catch (error) {
    if (!(error instanceof DataError)) throw error
    problems.push(error.message)
  }

  return { checked, problems }
}
