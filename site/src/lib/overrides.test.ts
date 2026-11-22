import { describe, expect, it } from 'vitest'
import { toggleOverride, type WhatIf } from './overrides.ts'

const none: WhatIf = { overrides: [] }
const pairs = (w: WhatIf) => w.overrides.map((o) => `${o.round}.${o.winner}.${o.loser}`)

describe('toggleOverride', () => {
  it('keeps other matches of the same round', () => {
    const one = toggleOverride(none, 1, 'a', 'b')
    const two = toggleOverride(one, 1, 'c', 'd')
    expect(pairs(two)).toEqual(['1.a.b', '1.c.d'])
  })

  it('drops later rounds, which may depend on the changed match', () => {
    const later = toggleOverride(toggleOverride(none, 1, 'a', 'b'), 2, 'a', 'c')
    expect(pairs(toggleOverride(later, 1, 'b', 'a'))).toEqual(['1.b.a'])
  })

  it('clears an override when the same winner is picked again', () => {
    const one = toggleOverride(none, 3, 'a', 'b')
    expect(pairs(toggleOverride(one, 3, 'a', 'b'))).toEqual([])
  })
})
