import type { MatchFormat } from '../../data/schemas/common.ts'
import type { SwissRules, TeamRecord } from './types.ts'

export interface SwissFormat {
  default: MatchFormat
  /** Format of elimination and advancement matches. */
  decider: MatchFormat
}

/**
 * A match is an elimination or advancement match if a win would advance either team or a loss would
 * eliminate either team. Those use `decider`; all others `default` (Valve: Bo3 and Bo1).
 */
export function swissMatchFormat(
  a: TeamRecord,
  b: TeamRecord,
  rules: SwissRules,
  format: SwissFormat,
): MatchFormat {
  const decides = [a, b].some(
    (team) => team.wins === rules.winsToAdvance - 1 || team.losses === rules.lossesToEliminate - 1,
  )
  return decides ? format.decider : format.default
}
