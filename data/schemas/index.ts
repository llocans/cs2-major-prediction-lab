import type { ZodType } from 'zod'
import { BookmakerOdds, LocalMarketOdds } from './bookmaker-odds.ts'
import { EventDraw } from './draw.ts'
import { EventConfig } from './event-config.ts'
import { EventTeams } from './event-teams.ts'
import { ModelParams, Modifiers, Ratings } from './model.ts'
import { EventResults } from './results.ts'
import { EventSlips } from './slips.ts'
import { Benchmarks, Snapshot } from './snapshot.ts'
import { TeamForm, TeamMapStats, TeamVetoStats } from './team-stats.ts'
import { TeamRegistry } from './teams-registry.ts'

export * from './bookmaker-odds.ts'
export * from './common.ts'
export * from './draw.ts'
export * from './event-config.ts'
export * from './event-teams.ts'
export * from './model.ts'
export * from './results.ts'
export * from './slips.ts'
export * from './snapshot.ts'
export * from './team-stats.ts'
export * from './teams-registry.ts'

/** Maps repo-relative data paths to their schema. One place, used by the hook and validate script. */
const routes: Array<[RegExp, ZodType]> = [
  [/^data\/events\/[^/]+\/config\.json$/, EventConfig],
  [/^data\/events\/[^/]+\/teams\.json$/, EventTeams],
  [/^data\/events\/[^/]+\/results\.json$/, EventResults],
  [/^data\/events\/[^/]+\/draw\.json$/, EventDraw],
  [/^data\/events\/[^/]+\/benchmarks\.json$/, Benchmarks],
  [/^data\/events\/[^/]+\/bookmaker-odds\.json$/, BookmakerOdds],
  [/^data\/events\/[^/]+\/local\/market-odds\.json$/, LocalMarketOdds],
  [/^data\/events\/[^/]+\/slips\.json$/, EventSlips],
  [/^data\/events\/[^/]+\/snapshots\/[^/]+\.json$/, Snapshot],
  [/^data\/events\/[^/]+\/snapshots\/alongside\/[^/]+\/[^/]+\.json$/, Snapshot],
  [/^data\/teams\/registry\.json$/, TeamRegistry],
  [/^data\/teams\/form\/[^/]+\.json$/, TeamForm],
  [/^data\/teams\/maps\/[^/]+\.json$/, TeamMapStats],
  [/^data\/teams\/vetoes\/[^/]+\.json$/, TeamVetoStats],
  [/^data\/ratings\/(current|history\/[^/]+)\.json$/, Ratings],
  [/^data\/model\/(params|archive\/[^/]+)\.json$/, ModelParams],
  [/^data\/model\/modifiers\.json$/, Modifiers],
]

export function schemaForPath(repoRelativePath: string): ZodType | undefined {
  return routes.find(([pattern]) => pattern.test(repoRelativePath))?.[1]
}
