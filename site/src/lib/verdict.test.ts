import { describe, expect, it } from 'vitest'
import { chanceVerdict, pickFor, stagePicks } from './verdict.ts'

describe('pickFor', () => {
  it('marks a won favourite as a hit', () => {
    expect(pickFor('nip', 'm80', 0.571, 'nip')).toEqual({ team: 'nip', p: 0.571, verdict: 'hit' })
  })
  it('marks a lost favourite as a miss, whichever side it is on', () => {
    expect(pickFor('lynn-vision', '9z', 0.37, 'lynn-vision')).toEqual({
      team: '9z',
      p: 0.63,
      verdict: 'miss',
    })
  })
  it('judges the percent as shown: 54.6% reads 55% and counts', () => {
    expect(chanceVerdict(0.546, true)).toBe('hit')
    expect(chanceVerdict(0.544, true)).toBe('coin-flip')
  })

  it('gives no verdict under 55%', () => {
    expect(pickFor('a', 'b', 0.544, 'b').verdict).toBe('coin-flip')
    expect(pickFor('a', 'b', 0.55, 'b').verdict).toBe('miss')
  })
})

describe('stagePicks', () => {
  const snapshots = [
    { stageId: 'stage-1', beforeRound: 1, matches: [{ teamA: '9z', teamB: 'lvg', pA: 0.63 }] },
    { stageId: 'stage-2', beforeRound: 1, matches: [{ teamA: '9z', teamB: 'lvg', pA: 0.2 }] },
  ]
  it('reads the snapshot of the same stage and round, whichever side the result lists first', () => {
    const results = [{ stageId: 'stage-1', round: 1, teamA: 'lvg', teamB: '9z', winner: 'lvg' }]
    const picks = stagePicks(snapshots, results, 'stage-1')
    expect(picks.get('1|9z|lvg')).toEqual({ team: '9z', p: 0.63, verdict: 'miss' })
  })
  it('never uses another stage or round', () => {
    const results = [{ stageId: 'stage-1', round: 2, teamA: '9z', teamB: 'lvg', winner: '9z' }]
    expect(stagePicks(snapshots, results, 'stage-1').size).toBe(0)
  })
})
