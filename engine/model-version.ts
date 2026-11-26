import type { StageModel } from '../data/schemas/event-config.ts'
import type { ModelParams } from '../data/schemas/model.ts'

/**
 * Model versions per stage. A stage runs on one version (its `model.version`, else the latest
 * params) and may score older versions next to it on the same matches (`model.alongside`).
 * Pure: callers pass every known params file.
 */

export interface StageVersions {
  main: ModelParams
  alongside: ModelParams[]
}

/** The params of one version. Throws when no params file has it. */
export function paramsByVersion(all: readonly ModelParams[], version: string): ModelParams {
  const params = all.find((p) => p.version === version)
  if (!params) {
    const known = all.map((p) => p.version).join(', ')
    throw new Error(`No model params for version ${version} (known: ${known})`)
  }
  return params
}

/**
 * The versions a stage runs on. `latest` is data/model/params.json, used when the stage names no
 * version. Throws when a version is unknown, listed twice, or runs alongside itself, and when an
 * alongside version rates teams differently (see `assertSharedRatingRules`).
 */
export function stageVersions(
  stage: { id: string; model?: StageModel | undefined },
  latest: ModelParams,
  all: readonly ModelParams[],
): StageVersions {
  const main = stage.model ? paramsByVersion(all, stage.model.version) : latest
  const ids = stage.model?.alongside ?? []
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${stage.id}: an alongside model version is listed twice`)
  }
  if (ids.includes(main.version)) {
    throw new Error(`${stage.id}: version ${main.version} cannot run alongside itself`)
  }
  const alongside = ids.map((id) => paramsByVersion(all, id))
  for (const other of alongside) assertSharedRatingRules(main, other)
  return { main, alongside }
}

/**
 * Versions that run on the same matches share one ratings file (data/ratings/current.json), so
 * they must rate teams the same way: same scale, prior, map strength and update rules. They may
 * differ in how a match is predicted from those ratings (veto, simulation, confidence).
 */
export function assertSharedRatingRules(a: ModelParams, b: ModelParams): void {
  const rules = (p: ModelParams) =>
    JSON.stringify({ scale: p.scale, prior: p.prior, maps: p.maps, update: p.update })
  if (rules(a) !== rules(b)) {
    throw new Error(
      `Model ${b.version} cannot run alongside ${a.version}: their rating rules differ ` +
        '(scale, prior, maps or update), and both read the same ratings file',
    )
  }
}
