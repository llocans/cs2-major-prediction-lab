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

async function throttledGet(params: Record<string, string>): Promise<unknown> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastRequestAt = Date.now()
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent(), 'Accept-Encoding': 'gzip' },
  })
  if (!response.ok) throw new Error(`Liquipedia ${response.status} for ${params.titles ?? url}`)
  return response.json()
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
