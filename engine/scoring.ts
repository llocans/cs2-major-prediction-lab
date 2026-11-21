/** Scoring of probabilistic predictions against outcomes. Pure functions. */

export interface Scored {
  /** Predicted probability of the event. */
  p: number
  /** 1 if the event happened, else 0. */
  outcome: 0 | 1
}

/** Mean squared error of the probabilities (lower is better; always predicting 50% scores 0.25). */
export function brierScore(predictions: readonly Scored[]): number {
  if (predictions.length === 0) throw new Error('Brier score of zero predictions is undefined')
  return (
    predictions.reduce((sum, { p, outcome }) => sum + (p - outcome) ** 2, 0) / predictions.length
  )
}

export interface CalibrationBin {
  from: number
  to: number
  count: number
  /** Average predicted probability in the bin. */
  predicted: number
  /** Share of events that happened. */
  observed: number
}

/** Groups predictions into equal-width probability bins (non-empty bins only). */
export function calibration(predictions: readonly Scored[], bins = 10): CalibrationBin[] {
  const result: CalibrationBin[] = []
  for (let i = 0; i < bins; i++) {
    const from = i / bins
    const to = (i + 1) / bins
    const inBin = predictions.filter(({ p }) => p >= from && (i === bins - 1 ? p <= to : p < to))
    if (inBin.length === 0) continue
    result.push({
      from,
      to,
      count: inBin.length,
      predicted: inBin.reduce((sum, x) => sum + x.p, 0) / inBin.length,
      observed: inBin.reduce((sum, x) => sum + x.outcome, 0) / inBin.length,
    })
  }
  return result
}

/** Share of predictions where the favourite (p > 0.5) won. Ties at exactly 0.5 are skipped. */
export function hitRate(predictions: readonly Scored[]): number {
  const decided = predictions.filter(({ p }) => p !== 0.5)
  if (decided.length === 0) return Number.NaN
  return decided.filter(({ p, outcome }) => p > 0.5 === (outcome === 1)).length / decided.length
}
