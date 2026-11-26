import { describe, expect, it } from 'vitest'
import { recordStatus } from './format.ts'

describe('recordStatus', () => {
  it('marks teams with enough wins as advanced', () => {
    expect(recordStatus('3-0', 3, 3)).toBe('advanced')
    expect(recordStatus('3-2', 3, 3)).toBe('advanced')
  })

  it('marks teams with enough losses as eliminated', () => {
    expect(recordStatus('0-3', 3, 3)).toBe('eliminated')
    expect(recordStatus('2-3', 3, 3)).toBe('eliminated')
  })

  it('leaves the rest playing', () => {
    expect(recordStatus('0-0', 3, 3)).toBe('playing')
    expect(recordStatus('2-2', 3, 3)).toBe('playing')
  })
})
