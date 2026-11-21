/** Glicko-style win probability on a logistic scale where `scale` points = 10:1 odds. */

const PI_SQUARED = Math.PI * Math.PI

/** Glicko's g(σ): shrinks a rating gap toward 0 when the ratings are uncertain. */
export function uncertaintyFactor(sigma: number, scale: number): number {
  const q = Math.log(10) / scale
  return 1 / Math.sqrt(1 + (3 * q * q * sigma * sigma) / PI_SQUARED)
}

/**
 * Probability that side A wins one map.
 * @param gap strength of A minus strength of B, in rating points
 * @param variance sum of all rating variances involved (rd² terms)
 */
export function winProbability(gap: number, variance: number, scale: number): number {
  const g = uncertaintyFactor(Math.sqrt(variance), scale)
  return 1 / (1 + 10 ** ((-g * gap) / scale))
}
