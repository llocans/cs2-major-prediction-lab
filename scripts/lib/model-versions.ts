/**
 * Model params by version: data/model/params.json is the latest version, data/model/archive/ keeps
 * older versions that a stage still runs on or scores alongside. When params.json gets a new
 * version, the old file is copied to archive/<old version>.json first (docs/model.md).
 */
import { existsSync, readdirSync } from 'node:fs'
import type { EventConfig } from '../../data/schemas/index.ts'
import { ModelParams } from '../../data/schemas/index.ts'
import { type StageVersions, stageVersions } from '../../engine/model-version.ts'
import { readJson, repoPath } from './files.ts'

export function latestParams(): ModelParams {
  return readJson(repoPath('data/model/params.json'), ModelParams)
}

/** params.json and every archived version. Throws on a duplicate or a misnamed archive file. */
export function allParams(): ModelParams[] {
  const all = [latestParams()]
  const dir = repoPath('data/model/archive')
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : []
  for (const file of files.sort()) {
    const params = readJson(`${dir}/${file}`, ModelParams)
    if (`${params.version}.json` !== file) {
      throw new Error(`data/model/archive/${file} holds version ${params.version}`)
    }
    if (all.some((p) => p.version === params.version)) {
      throw new Error(`Model version ${params.version} is in more than one params file`)
    }
    all.push(params)
  }
  return all
}

/** The params of one version, or the latest without a version. */
export function loadParams(version?: string): ModelParams {
  const latest = latestParams()
  if (version === undefined || version === latest.version) return latest
  const found = allParams().find((p) => p.version === version)
  if (!found) throw new Error(`No model params for version ${version}`)
  return found
}

/** The model version a stage runs on and the versions scored alongside it. */
export function loadStageVersions(config: EventConfig, stageId: string): StageVersions {
  const stage = config.stages.find((s) => s.id === stageId)
  if (!stage) throw new Error(`${config.id}: no stage "${stageId}"`)
  return stageVersions(stage, latestParams(), allParams())
}
