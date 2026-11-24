/**
 * What-if state kept only in the URL: forced match winners.
 * Format: ?w=<round>.<winner>.<loser>,...
 * Never written to data files.
 */
export interface Override {
  round: number
  winner: string
  loser: string
}

export interface WhatIf {
  overrides: Override[]
}

export function readWhatIf(query: URLSearchParams): WhatIf {
  const overrides = (query.get('w') ?? '')
    .split(',')
    .filter(Boolean)
    .flatMap((item) => {
      const [round, winner, loser] = item.split('.')
      const n = Number(round)
      return Number.isInteger(n) && winner && loser ? [{ round: n, winner, loser }] : []
    })
  return { overrides }
}

export function writeWhatIf(query: URLSearchParams, whatIf: WhatIf): URLSearchParams {
  const next = new URLSearchParams(query)
  const w = whatIf.overrides.map((o) => `${o.round}.${o.winner}.${o.loser}`).join(',')
  if (w) next.set('w', w)
  else next.delete('w')
  // Links from before seed swaps were removed may still carry ?swap=; drop it.
  next.delete('swap')
  return next
}

/** Sets (or clears, when the same winner is clicked again) the forced winner of one match. */
export function toggleOverride(
  whatIf: WhatIf,
  round: number,
  winner: string,
  loser: string,
): WhatIf {
  const same = (o: Override) =>
    o.round === round && [o.winner, o.loser].sort().join() === [winner, loser].sort().join()
  const existing = whatIf.overrides.find(same)
  const others = whatIf.overrides.filter((o) => !same(o))
  // Later rounds may depend on this match, so drop overrides of later rounds. Other matches of the
  // same round are independent of it and stay.
  const kept = others.filter((o) => o.round <= round)
  const overrides = existing?.winner === winner ? kept : [...kept, { round, winner, loser }]
  return { ...whatIf, overrides }
}
