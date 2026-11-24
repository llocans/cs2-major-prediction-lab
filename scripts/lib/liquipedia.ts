/**
 * Liquipedia MediaWiki API client following Liquipedia's API terms (docs/sources.md):
 * - action=query, at most 1 request every 2 seconds (we wait 2.1 s); the one parse-type call,
 *   expandTemplates (research only, never the poller), at most 1 every 30 seconds (docs/sources.md)
 * - gzip, a User-Agent with the project name and a contact from LIQUIPEDIA_CONTACT
 * - responses cached in .cache/liquipedia/pages/, keyed by title; revid checks avoid refetching content
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { repoPath } from './files.ts'

const API = 'https://liquipedia.net/counterstrike/api.php'
const MIN_INTERVAL_MS = 2100
/** Liquipedia's limit for parse-type requests (action=parse, action=expandtemplates). */
const PARSE_INTERVAL_MS = 30_500
const VERSION = '0.1.0'
let lastRequestAt = 0
let lastParseAt = 0

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

async function throttledGet(params: Record<string, string>, minRetryMs = 0): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  return (await throttledFetch(url, params.titles ?? url, minRetryMs)).json()
}

/** One request at Liquipedia's pace, with the one retry after a 429 or 503. */
async function throttledFetch(url: string, label: string, minRetryMs = 0): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent(), 'Accept-Encoding': 'gzip' },
    })
    if (response.ok) return response
    // Rate limited or briefly unavailable: wait as asked and try once more. The error text keeps
    // "Liquipedia <status>", which the poll loop reads to switch to a fresh runner (poll-loop.sh).
    if (attempt === 1 && (response.status === 429 || response.status === 503)) {
      await sleep(Math.max(minRetryMs, retryDelayMs(response.headers.get('retry-after'))))
      continue
    }
    throw new Error(`Liquipedia ${response.status} for ${label}`)
  }
}

interface ImageInfoResponse {
  query?: {
    normalized?: Array<{ from: string; to: string }>
    pages?: Record<string, { title: string; imageinfo?: Array<{ thumburl?: string; url: string }> }>
  }
}

/**
 * Download links for Liquipedia files, scaled by Liquipedia to fit a `width` x `height` box (the
 * original when it is already smaller). Keys are the file names as given, without "File:". One
 * action=query request per 50 files.
 */
export async function imageThumbUrls(
  files: string[],
  box: { width: number; height: number },
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50)
    const data = (await throttledGet({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(box.width),
      iiurlheight: String(box.height),
      titles: batch.map((file) => `File:${file}`).join('|'),
    })) as ImageInfoResponse
    const asked = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]))
    for (const page of Object.values(data.query?.pages ?? {})) {
      const info = page.imageinfo?.[0]
      if (!info) continue
      const name = (asked.get(page.title) ?? page.title).replace(/^File:/, '')
      result.set(name, info.thumburl ?? info.url)
    }
  }
  return result
}

/** Downloads one Liquipedia file (an image link from `imageThumbUrls`), at the API's pace. */
export async function downloadFile(url: string): Promise<Uint8Array> {
  if (new URL(url).hostname !== 'liquipedia.net') throw new Error(`Not a Liquipedia file: ${url}`)
  return new Uint8Array(await (await throttledFetch(url, url)).arrayBuffer())
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

/**
 * Expands wikitext templates (action=expandtemplates, a parse-type request: at most 1 every 30 s,
 * also on the retry). Batch everything into one call; used by research scripts only, never by the
 * poller. Cached for a day in .cache/liquipedia/expand/, keyed by the text.
 */
export async function expandTemplates(text: string): Promise<string> {
  const key = createHash('sha256').update(text).digest('hex').slice(0, 16)
  const file = repoPath('.cache/liquipedia/expand', `${key}.json`)
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < 24 * 3600 * 1000) {
    return (JSON.parse(readFileSync(file, 'utf8')) as { wikitext: string }).wikitext
  }
  const wait = lastParseAt + PARSE_INTERVAL_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastParseAt = Date.now()
  const data = (await throttledGet(
    { action: 'expandtemplates', prop: 'wikitext', text },
    PARSE_INTERVAL_MS,
  )) as { expandtemplates?: { wikitext?: string } }
  const wikitext = data.expandtemplates?.wikitext
  if (wikitext === undefined) throw new Error('Liquipedia expandtemplates returned no wikitext')
  mkdirSync(repoPath('.cache/liquipedia/expand'), { recursive: true })
  writeFileSync(file, JSON.stringify({ wikitext }))
  return wikitext
}
