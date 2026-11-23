/**
 * Finished simulations, remembered in this browser. The simulation is deterministic: the same input
 * (results, ratings, parameters, seeds, what-ifs, date) and the same engine always give the same
 * numbers, so a stored result for an identical input is exactly what a new run would show. New data
 * or an engine change gives a new key, and the page simulates again.
 */
import engineVersion from 'virtual:engine-version'
import type { AnyPrediction } from './protocol.ts'
import { decode, encode } from './serialize.ts'

const PREFIX = 'cs2lab:sim:v1:'
const INDEX = `${PREFIX}index`
/** Keep the latest few results (stage pages, playoffs, Pick'Em tabs). */
const KEEP = 8

/** 53-bit string hash (cyrb53). Not cryptographic; only tells inputs apart. */
export function hash53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Cache key of a request (its JSON, without the per-run id) for the current engine. */
export const cacheKey = (requestJson: string) => hash53(`${engineVersion}|${requestJson}`)

const memory = new Map<string, AnyPrediction>()

function readIndex(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(INDEX) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

export function readCached(key: string): AnyPrediction | undefined {
  const hit = memory.get(key)
  if (hit) return hit
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) return undefined
    // Written only by saveCached below from a finished simulation of the same key.
    const prediction = decode(raw) as AnyPrediction
    memory.set(key, prediction)
    return prediction
  } catch {
    return undefined
  }
}

export function saveCached(key: string, prediction: AnyPrediction): void {
  memory.set(key, prediction)
  try {
    const index = [key, ...readIndex().filter((k) => k !== key)]
    for (const old of index.slice(KEEP)) window.localStorage.removeItem(PREFIX + old)
    window.localStorage.setItem(PREFIX + key, encode(prediction))
    window.localStorage.setItem(INDEX, JSON.stringify(index.slice(0, KEEP)))
  } catch {
    // Storage full or blocked: the in-memory copy still serves this visit.
  }
}
