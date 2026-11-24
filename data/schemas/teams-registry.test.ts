import { describe, expect, it } from 'vitest'
import { teamLogoPaths } from './teams-registry.ts'

describe('teamLogoPaths', () => {
  it("gives the team's own files, an event's own files, and a dark file only when there is one", () => {
    expect(teamLogoPaths('nip', undefined)).toBeUndefined()
    expect(teamLogoPaths('mouz', {})).toEqual({
      light: 'logos/mouz.png',
    })
    expect(teamLogoPaths('nip', { dark: 'b.png' })).toEqual({
      light: 'logos/nip.png',
      dark: 'logos/nip-dark.png',
    })
    expect(teamLogoPaths('bc-game', {}, 'pgl-major-singapore-2026')).toEqual({
      light: 'logos/pgl-major-singapore-2026/bc-game.png',
    })
  })
})
