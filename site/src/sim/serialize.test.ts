import { describe, expect, it } from 'vitest'
import { decode, encode } from './serialize.ts'

describe('simulation cache encoding', () => {
  it('round-trips plain data and Uint8Arrays', () => {
    const codes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 4)
    const value = { kind: 'swiss', value: { p: 0.25, teams: ['a'] }, outcomes: { runs: 2, codes } }
    const back = decode(encode(value)) as typeof value
    expect(back.value).toEqual(value.value)
    expect(back.outcomes.codes).toBeInstanceOf(Uint8Array)
    expect([...back.outcomes.codes]).toEqual([...codes])
  })
})
