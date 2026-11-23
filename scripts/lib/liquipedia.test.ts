import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { latestRevid, retryDelayMs } from './liquipedia.ts'

describe('retryDelayMs', () => {
  it('follows Retry-After within 10-90 s, else waits 30 s', () => {
    expect(retryDelayMs('45')).toBe(45_000)
    expect(retryDelayMs('2')).toBe(10_000)
    expect(retryDelayMs('600')).toBe(90_000)
    expect(retryDelayMs(null)).toBe(30_000)
    expect(retryDelayMs('Wed, 21 Oct 2026 07:28:00 GMT')).toBe(30_000)
  })
})

describe('Liquipedia requests', () => {
  const ok = {
    query: { pages: { '1': { title: 'X', revisions: [{ revid: 42, timestamp: 't' }] } } },
  }
  const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers })

  // The client spaces requests from the last one it sent (module state), so every test starts its
  // fake clock a day after the previous one: no spacing wait is left over.
  let day = 0
  beforeEach(() => {
    vi.stubEnv('LIQUIPEDIA_CONTACT', 'test@example.com')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z').getTime() + ++day * 86_400_000)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('retries once after a 429, waiting as asked', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(429, {}, { 'Retry-After': '20' }))
      .mockResolvedValueOnce(reply(200, ok))
    const revid = latestRevid('X')
    await vi.advanceTimersByTimeAsync(19_000)
    expect(fetch).toHaveBeenCalledTimes(1) // still waiting the 20 s Retry-After
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(revid).resolves.toBe(42)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('also retries once after a 503', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(200, ok))
    const revid = latestRevid('X')
    await vi.advanceTimersByTimeAsync(31_000)
    await expect(revid).resolves.toBe(42)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after the second 429, with "Liquipedia 429" in the error', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(429))
    const revid = latestRevid('X')
    const checked = expect(revid).rejects.toThrow('Liquipedia 429 for X')
    await vi.advanceTimersByTimeAsync(31_000)
    await checked
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry other errors', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(404))
    const revid = latestRevid('X')
    const checked = expect(revid).rejects.toThrow('Liquipedia 404 for X')
    await vi.advanceTimersByTimeAsync(31_000)
    await checked
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
