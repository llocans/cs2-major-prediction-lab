import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EventConfig } from '../../data/schemas/index.ts'
import { readJson, repoPath, repoRoot } from './files.ts'
import { allParams, loadStageVersions } from './model-versions.ts'

describe('model versions in the repository', () => {
  it('have one params file each', () => {
    const versions = allParams().map((p) => p.version)
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('resolve for every stage of every event, with shared rating rules alongside', () => {
    for (const file of globSync('data/events/*/config.json', { cwd: repoRoot })) {
      const config = readJson(repoPath(file), EventConfig)
      for (const stage of config.stages) {
        expect(() => loadStageVersions(config, stage.id), `${config.id} ${stage.id}`).not.toThrow()
      }
    }
  })
})
