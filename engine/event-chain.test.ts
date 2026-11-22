import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EventConfig } from '../data/schemas/event-config.ts'
import { EventTeams } from '../data/schemas/event-teams.ts'
import { buildEventChain } from './event-chain.ts'

const dir = join(import.meta.dirname, '../data/events/pgl-major-singapore-2026')
const config = EventConfig.parse(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')))
const { participants } = EventTeams.parse(JSON.parse(readFileSync(join(dir, 'teams.json'), 'utf8')))

describe('buildEventChain (PGL Singapore config)', () => {
  it('chains Stage 2, Stage 3 and the playoffs from Stage 1', () => {
    const chain = buildEventChain(config, participants, 'stage-1')
    expect(chain.next.map((s) => s.id)).toEqual(['stage-2', 'stage-3'])
    for (const stage of chain.next) {
      expect(stage.invited).toHaveLength(8)
      const seeds = stage.invited.map((id) => participants.find((p) => p.teamId === id)?.stageSeed)
      expect(seeds).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    }
    expect(chain.playoffs?.rules.format.final).toBe('bo5')
  })

  it('has only the playoffs after Stage 3', () => {
    const chain = buildEventChain(config, participants, 'stage-3')
    expect(chain.next).toEqual([])
    expect(chain.playoffs).toBeDefined()
  })

  it('leaves the playoffs out when a playoff format has no veto procedure', () => {
    const { bo5: _bo5, ...veto } = config.veto
    const chain = buildEventChain({ ...config, veto }, participants, 'stage-1')
    expect(chain.playoffs).toBeUndefined()
    expect(chain.next).toHaveLength(2)
  })

  it('only starts from a Swiss stage', () => {
    expect(() => buildEventChain(config, participants, 'playoffs')).toThrow(/No Swiss stage/)
  })
})
