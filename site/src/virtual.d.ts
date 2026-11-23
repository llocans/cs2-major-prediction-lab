/** Hash of the engine's source (vite.config.ts), part of the simulation cache key. */
declare module 'virtual:engine-version' {
  const version: string
  export default version
}
