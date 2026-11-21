import type { ModelParams } from '../../data/schemas/model.ts'

export interface PriorInput {
  vrsPoints: number
  /** Series vs VRS top-50 teams in the last 6 months. Below params.prior.coldStartSeries = cold start. */
  tier1Series: number
}

/** Rating prior from VRS points (see docs/model.md, "Prior"). */
export function priorRating(
  input: PriorInput,
  params: ModelParams,
): { rating: number; rd: number } {
  const { base, vrsCenter, perVrsPoint, rd, coldStartRd, coldStartSeries } = params.prior
  return {
    rating: base + perVrsPoint * (input.vrsPoints - vrsCenter),
    rd: input.tier1Series < coldStartSeries ? coldStartRd : rd,
  }
}
