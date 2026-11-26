import { describe, expect, it } from 'vitest'
import params from '../data/model/params.json' with { type: 'json' }
import { ModelParams } from '../data/schemas/model.ts'
import { assertSharedRatingRules, paramsByVersion, stageVersions } from './model-version.ts'

const v1 = ModelParams.parse({ ...params, version: '1.0.0' })
const v2 = ModelParams.parse({ ...params, version: '2.0.0', veto: { temperature: 10 } })
const all = [v2, v1]

describe('stageVersions', () => {
  it('uses the latest params when a stage names no version', () => {
    expect(stageVersions({ id: 's' }, v2, all)).toEqual({ main: v2, alongside: [] })
  })

  it('picks the named version and the versions scored alongside it', () => {
    const stage = { id: 's', model: { version: '2.0.0', alongside: ['1.0.0'] } }
    expect(stageVersions(stage, v2, all)).toEqual({ main: v2, alongside: [v1] })
    expect(stageVersions({ id: 's', model: { version: '1.0.0' } }, v2, all).main).toBe(v1)
  })

  it('rejects unknown, repeated and self-alongside versions', () => {
    expect(() => paramsByVersion(all, '9.9.9')).toThrow(/No model params for version 9.9.9/)
    const repeated = { id: 's', model: { version: '2.0.0', alongside: ['1.0.0', '1.0.0'] } }
    expect(() => stageVersions(repeated, v2, all)).toThrow(/listed twice/)
    const self = { id: 's', model: { version: '2.0.0', alongside: ['2.0.0'] } }
    expect(() => stageVersions(self, v2, all)).toThrow(/alongside itself/)
  })

  it('only lets versions with the same rating rules run alongside each other', () => {
    expect(() => assertSharedRatingRules(v2, v1)).not.toThrow()
    const otherK = ModelParams.parse({
      ...params,
      version: '3.0.0',
      update: { ...params.update, k: 30 },
    })
    expect(() => assertSharedRatingRules(v2, otherK)).toThrow(/rating rules differ/)
  })
})
