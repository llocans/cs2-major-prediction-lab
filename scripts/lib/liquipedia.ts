/**
 * Liquipedia MediaWiki API client following Liquipedia's API terms (docs/sources.md):
 * - action=query only (no parse), at most 1 request every 2 seconds (we wait 2.1 s)
 * - gzip, a User-Agent with the project name and a contact from LIQUIPEDIA_CONTACT
 * - responses cached in .cache/liquipedia/pages/, keyed by title; revid checks avoid refetching content
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { repoPath } from './files.ts'

const API = 'https://liquipedia.net/counterstrike/api.php'
const MIN_INTERVAL_MS = 2100
const VERSION = '0.1.0'
let lastRequestAt = 0

export interface WikiPage {
  title: string
  revid: number
  timestamp: string
  text: string
}

function userAgent(): string {
  const contact = process.env.LIQUIPEDIA_CONTACT?.trim()
  if (!contact) {
    throw new Error(
      'LIQUIPEDIA_CONTACT is not set. Add it to .env (see .env.example); Liquipedia requires a contact.',
    )
  }
  return `cs2-major-prediction-lab/${VERSION} (${contact})`
}

/**
 * How long to wait before the one retry after a 429 or 503: the server's Retry-After (seconds) if it
 * sends one, else 30 s, kept between 10 and 90 s so a poll stays well inside its 10-minute limit.
 */
export function retryDelayMs(retryAfter: string | null): number {
  const seconds = Number(retryAfter)
  const wanted = retryAfter !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : 30
  return Math.min(90, Math.max(10, wanted)) * 1000
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function throttledGet(params: Record<string, string>): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent(), 'Accept-Encoding': 'gzip' },
    })
    if (response.ok) return response.json()
    // Rate limited or briefly unavailable: wait as asked and try once more. The error text keeps
    // "Liquipedia <status>", which the poll loop reads to switch to a fresh runner (poll-loop.sh).
    if (attempt === 1 && (response.status === 429 || response.status === 503)) {
      await sleep(retryDelayMs(response.headers.get('retry-after')))
      continue
    }
    throw new Error(`Liquipedia ${response.status} for ${params.titles ?? url}`)
  }
}

interface RevisionsResponse {
  query?: {
    pages?: Record<
      string,
      {
        title: string
        missing?: string
        revisions?: Array<{ revid: number; timestamp: string; slots?: { main?: { '*'?: string } } }>
      }
    >
  }
}

function cacheFile(title: string): string {
  return repoPath('.cache/liquipedia/pages', `${title.replaceAll(/[/ ]/g, '_')}.json`)
}

function readCache(title: string): WikiPage | undefined {
  const file = cacheFile(title)
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf8')) as WikiPage
}

/** Current revision id of a page, without its content (cheap). */
export async function latestRevid(title: string): Promise<number> {
  const data = (await throttledGet({
    action: 'query',
    prop: 'revisions',
    rvprop: 'ids',
    redirects: '1',
    titles: title,
  })) as RevisionsResponse
  const page = Object.values(data.query?.pages ?? {})[0]
  const revid = page?.revisions?.[0]?.revid
  if (!page || page.missing !== undefined || revid === undefined) {
    throw new Error(`Liquipedia page not found: ${title}`)
  }
  return revid
}

/**
 * Wikitext of a page. With `maxAgeMs`, a cached copy younger than that is returned without any request.
 * Otherwise checks the revid first and only downloads content when the page changed.
 */
export async function getPage(
  title: string,
  options: { maxAgeMs?: number } = {},
): Promise<WikiPage> {
  const cached = readCache(title)
  const file = cacheFile(title)
  if (cached && options.maxAgeMs !== undefined) {
    if (Date.now() - statSync(file).mtimeMs < options.maxAgeMs) return cached
  }
  if (cached && (await latestRevid(title)) === cached.revid) {
    writeFileSync(file, JSON.stringify(cached))
    return cached
  }
  const data = (await throttledGet({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content|ids|timestamp',
    rvslots: 'main',
    redirects: '1',
    titles: title,
  })) as RevisionsResponse
  const page = Object.values(data.query?.pages ?? {})[0]
  const revision = page?.revisions?.[0]
  const text = revision?.slots?.main?.['*']
  if (!page || !revision || text === undefined)
    throw new Error(`Liquipedia page not found: ${title}`)
  const result: WikiPage = {
    title: page.title,
    revid: revision.revid,
    timestamp: revision.timestamp,
    text,
  }
  mkdirSync(repoPath('.cache/liquipedia/pages'), { recursive: true })
  writeFileSync(file, JSON.stringify(result))
  return result
}
