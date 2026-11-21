/**
 * Seeded pseudo-random numbers (xoshiro128**, seeded with splitmix32).
 * The only source of randomness in the engine, so every simulation is reproducible.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x9e3779b9) >>> 0
    let z = state
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    return (z ^ (z >>> 16)) >>> 0
  }
}

export function createRng(seed: number): Rng {
  const init = splitmix32(seed)
  let a = init()
  let b = init()
  let c = init()
  let d = init()
  return {
    next() {
      const result = Math.imul(rotl(Math.imul(b, 5) >>> 0, 7), 9) >>> 0
      const t = (b << 9) >>> 0
      c ^= a
      d ^= b
      b ^= c
      a ^= d
      c ^= t
      d = rotl(d, 11)
      return result / 4294967296
    },
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}
