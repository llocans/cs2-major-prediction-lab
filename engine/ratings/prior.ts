import type { ModelParams } from '../../data/schemas/model.ts'

export interface PriorInput {
  vrsPoints: number
  /** Tier-1 maps played in the research window. Below params.prior.coldStartMaps = cold start. */
  tier1Maps: number
}

/** Rating prior from VRS points (see docs/model.md, "Prior"). */
export function priorRating(
  input: PriorInput,
  params: ModelParams,
): { rating: number; rd: number } {
  const { base, vrsCenter, perVrsPoint, rd, coldStartRd, coldStartMaps } = params.prior
  return {
    rating: base + perVrsPoint * (input.vrsPoints - vrsCenter),
    rd: input.tier1Maps < coldStartMaps ? coldStartRd : rd,
  }
}
