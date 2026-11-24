import { describe, expect, it } from 'vitest'
import { pickFor } from './verdict.ts'

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
  it('gives no verdict under 55%', () => {
    expect(pickFor('a', 'b', 0.544, 'b').verdict).toBe('coin-flip')
    expect(pickFor('a', 'b', 0.55, 'b').verdict).toBe('miss')
  })
})
