import type { Stage } from '../../../data/schemas/event-config.ts'
import type { Snapshot, TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { swissStandings } from '../../../engine/swiss/standings.ts'
import type { SwissMatch, SwissRules } from '../../../engine/swiss/types.ts'

/**
 * A finished Swiss stage's final table from its real results (every team has advanced or is out),
 * so the page needs no simulation. Undefined while any team is still playing.
 */
export function finalOutlook(
  seeds: readonly string[],
  played: readonly SwissMatch[],
  rules: SwissRules,
): TeamOutlook[] | undefined {
  const standings = swissStandings(seeds, played, rules)
  if (standings.some((s) => s.status === 'active')) return undefined
  return standings.map((s) => {
    const advanced = s.status === 'advanced'
    return {
      teamId: s.teamId,
      record: `${s.wins}-${s.losses}`,
      p30: advanced && s.losses === 0 ? 1 : 0,
      pAdvance: advanced ? 1 : 0,
      p03: !advanced && s.wins === 0 ? 1 : 0,
      pEliminated: advanced ? 0 : 1,
      confidence: 'high',
      reason: advanced ? 'advanced' : 'eliminated',
    }
  })
}

/**
 * A finished Swiss stage's whole-event odds as they stood when it ended: the next stage's round 1
 * snapshot, which the poller saves the moment the stage finishes (never edited), from the finished
 * stage's own model version. Undefined while the stage is running, or when no such snapshot exists.
 */
export function lockedEventSnapshot(
  stage: Stage,
  version: string,
  snapshots: readonly Snapshot[],
): Snapshot | undefined {
  if (stage.type !== 'swiss' || !stage.advanceTo) return undefined
  return snapshots.find(
    (s) => s.stageId === stage.advanceTo && s.beforeRound === 1 && s.modelVersion === version,
  )
}

/**
 * The stage's teams with Playoffs and Title replaced by the locked odds. A team missing from the
 * snapshot was knocked out (0%); a team in a playoff snapshot is in the playoffs (100%).
 */
export function withLockedEventOdds(
  teams: readonly TeamOutlook[],
  locked: Snapshot,
): TeamOutlook[] {
  const swiss = new Map(locked.teams.map((t) => [t.teamId, t]))
  const playoff = new Map((locked.playoffTeams ?? []).map((t) => [t.teamId, t]))
  return teams.map((team) => {
    const inPlayoffs = playoff.get(team.teamId)
    if (inPlayoffs) return { ...team, pPlayoffs: 1, pTitle: inPlayoffs.pTitle }
    const next = swiss.get(team.teamId)
    return { ...team, pPlayoffs: next?.pPlayoffs ?? 0, pTitle: next?.pTitle ?? 0 }
  })
}
