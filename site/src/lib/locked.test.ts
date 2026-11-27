import { describe, expect, it } from 'vitest'
import type { Stage } from '../../../data/schemas/event-config.ts'
import type { Snapshot, TeamOutlook } from '../../../data/schemas/snapshot.ts'
import { lockedEventSnapshot, withLockedEventOdds } from './locked.ts'

const stage = { id: 's1', type: 'swiss', advanceTo: 's2' } as Stage
const snap = (stageId: string, beforeRound: number, modelVersion: string, extra = {}) =>
  ({ stageId, beforeRound, modelVersion, teams: [], ...extra }) as unknown as Snapshot
const team = (teamId: string, pPlayoffs: number, pTitle: number) =>
  ({ teamId, pPlayoffs, pTitle }) as TeamOutlook

describe('lockedEventSnapshot', () => {
  it("takes the next stage's round 1 snapshot from the finished stage's own version", () => {
    const own = snap('s2', 1, '0.1.0')
    const snapshots = [snap('s2', 1, '0.2.0'), snap('s2', 2, '0.1.0'), own, snap('s1', 5, '0.1.0')]
    expect(lockedEventSnapshot(stage, '0.1.0', snapshots)).toBe(own)
  })

  it('is undefined while the stage runs or without a next stage', () => {
    expect(lockedEventSnapshot(stage, '0.1.0', [snap('s1', 5, '0.1.0')])).toBeUndefined()
    const last = { id: 's3', type: 'swiss' } as Stage
    expect(lockedEventSnapshot(last, '0.1.0', [snap('s2', 1, '0.1.0')])).toBeUndefined()
  })
})

describe('withLockedEventOdds', () => {
  const live = [team('a', 0.5, 0.1), team('b', 0.4, 0.05), team('c', 0.3, 0.01)]

  it('replaces Playoffs and Title; a team missing from the snapshot is out', () => {
    const locked = snap('s2', 1, '0.1.0', {
      teams: [team('a', 0.36, 0.011), team('b', 0.2, 0.002)],
    })
    expect(withLockedEventOdds(live, locked)).toEqual([
      team('a', 0.36, 0.011),
      team('b', 0.2, 0.002),
      team('c', 0, 0),
    ])
  })

  it('reads a playoff snapshot: in the bracket means 100% Playoffs', () => {
    const locked = snap('po', 1, '0.1.0', {
      playoffTeams: [{ teamId: 'a', pSemifinal: 0.6, pFinal: 0.4, pTitle: 0.25, reason: '' }],
    })
    expect(withLockedEventOdds(live, locked).map((t) => [t.pPlayoffs, t.pTitle])).toEqual([
      [1, 0.25],
      [0, 0],
      [0, 0],
    ])
  })
})
