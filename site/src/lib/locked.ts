import type { Stage } from '../../../data/schemas/event-config.ts'
import type { Snapshot, TeamOutlook } from '../../../data/schemas/snapshot.ts'

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
