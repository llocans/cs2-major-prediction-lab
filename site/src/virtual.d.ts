/** Hash of the engine's source (vite.config.ts), part of the simulation cache key. */
declare module 'virtual:engine-version' {
  const version: string
  export default version
}

/**
 * The bookmaker's own decimal odds per event (vite.config.ts): the dev server on this Mac only; empty
 * in a built site. Raw file contents, parsed with `LocalMarketOdds`.
 */
declare module 'virtual:local-market-odds' {
  const odds: Record<string, unknown>
  export default odds
}
