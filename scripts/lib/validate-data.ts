import { existsSync, globSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  Benchmarks,
  BookmakerOdds,
  EventConfig,
  EventTeams,
  LOGO_DIR,
  schemaForPath,
  TeamRegistry,
  teamLogoPaths,
} from '../../data/schemas/index.ts'
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
    problems.push(...checkLogoFiles(registry))
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

  for (const configFile of globSync('data/events/*/config.json', { cwd: repoRoot })) {
    try {
      problems.push(...checkMarketRules(configFile))
    } catch (error) {
      if (!(error instanceof DataError)) throw error
      problems.push(error.message)
    }
  }

  return { checked, problems }
}

/**
 * Every stage with logged market odds has its own `marketRule`, so its value-pick record never
 * falls back to a rule that could change later (engine/market-picks.ts).
 */
function checkMarketRules(configFile: string): string[] {
  const config = readJson(repoPath(configFile), EventConfig)
  const dir = dirname(configFile)
  const stagesWithOdds = new Set<string>()
  const oddsFile = repoPath(dir, 'bookmaker-odds.json')
  if (existsSync(oddsFile)) {
    for (const e of readJson(oddsFile, BookmakerOdds).entries) stagesWithOdds.add(e.stageId)
  }
  const benchmarksFile = repoPath(dir, 'benchmarks.json')
  if (existsSync(benchmarksFile)) {
    for (const e of readJson(benchmarksFile, Benchmarks).entries) stagesWithOdds.add(e.stageId)
  }
  return config.stages
    .filter((stage) => stagesWithOdds.has(stage.id) && !stage.marketRule)
    .map((stage) => `${configFile}: ${stage.id} has market odds but no marketRule`)
}

/**
 * Each logo in the registry and in events' teams.json has its files in site/public/, and every file
 * there belongs to one of them.
 */
function checkLogoFiles(registry: TeamRegistry): string[] {
  const problems: string[] = []
  const expected = new Set<string>()
  const expect = (where: string, teamId: string, paths: Record<string, string> | undefined) => {
    for (const path of Object.values(paths ?? {})) {
      expected.add(path)
      if (!existsSync(repoPath('site/public', path))) {
        problems.push(`${where}: ${teamId} logo file site/public/${path} is missing`)
      }
    }
  }
  for (const team of registry.teams) {
    expect('data/teams/registry.json', team.id, teamLogoPaths(team.id, team.logo))
  }
  for (const teamsFile of globSync('data/events/*/teams.json', { cwd: repoRoot })) {
    const teams = readJson(repoPath(teamsFile), EventTeams)
    for (const p of teams.participants) {
      expect(teamsFile, p.teamId, teamLogoPaths(p.teamId, p.logo, teams.eventId))
    }
  }
  for (const path of globSync(`${LOGO_DIR}/**/*.png`, { cwd: repoPath('site/public') })) {
    if (!expected.has(path)) {
      problems.push(`site/public/${path}: no team or event uses this logo`)
    }
  }
  return problems
}
