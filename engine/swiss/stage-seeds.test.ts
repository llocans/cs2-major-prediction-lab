import { describe, expect, it } from 'vitest'
import { stageSeeds } from './stage-seeds.ts'

const p = (
  teamId: string,
  entryStage: string,
  stageSeed: number,
  advanced?: Record<string, number>,
) =>
  advanced
    ? { teamId, displayName: teamId, entryStage, stageSeed, advancedSeeds: advanced }
    : { teamId, displayName: teamId, entryStage, stageSeed }

describe('stageSeeds', () => {
  it('combines invited and advanced teams in seed order', () => {
    const participants = [
      p('a', 'stage-1', 1, { 'stage-2': 2 }),
      p('x', 'stage-2', 1),
      p('b', 'stage-1', 2),
    ]
    expect(stageSeeds(participants, 'stage-2')).toEqual(['x', 'a'])
    expect(stageSeeds(participants, 'stage-1')).toEqual(['a', 'b'])
  })

  it('rejects a seed used twice', () => {
    expect(() => stageSeeds([p('a', 'stage-2', 1), p('b', 'stage-2', 1)], 'stage-2')).toThrow(
      /twice/,
    )
  })
})
