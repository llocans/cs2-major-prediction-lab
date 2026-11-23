/**
 * Your Pick'Em picks, kept in this browser only (localStorage, per site address). Never written to
 * the repo. Reads are validated; anything unreadable counts as no picks.
 */
import { useCallback, useState } from 'react'
import { z } from 'zod'

const SwissPicksSchema = z.object({
  threeZero: z.array(z.string()),
  advance: z.array(z.string()),
  zeroThree: z.array(z.string()),
})
const PlayoffPicksSchema = z.record(z.string(), z.string())

const Stored = z.object({
  /** When the picks last changed (ISO date-time). */
  updatedAt: z.string(),
  swiss: SwissPicksSchema.optional(),
  playoffs: PlayoffPicksSchema.optional(),
})
export type StoredPicks = z.infer<typeof Stored>

const storageKey = (eventId: string, stageId: string) => `cs2lab:pickem:v1:${eventId}:${stageId}`

function read(key: string): StoredPicks | undefined {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return undefined
    const parsed = Stored.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: StoredPicks | undefined): void {
  try {
    if (value === undefined) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked (private window, disabled site data): picks last until the page closes.
  }
}

/** Picks for one stage, saved on every change. `save(undefined)` clears them. */
export function useStoredPicks(eventId: string, stageId: string) {
  const key = storageKey(eventId, stageId)
  const [state, setState] = useState(() => ({ key, value: read(key) }))
  // A different stage: load its picks (state follows the key without an effect).
  const value = state.key === key ? state.value : read(key)
  if (state.key !== key) setState({ key, value })

  const save = useCallback(
    (next: Omit<StoredPicks, 'updatedAt'> | undefined) => {
      const stored = next && { ...next, updatedAt: new Date().toISOString() }
      write(key, stored)
      setState({ key, value: stored })
    },
    [key],
  )
  return [value, save] as const
}
