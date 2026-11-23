import { useEffect, useState } from 'react'

/** Hash routes, so the static build works on any host without server rewrites. */
export type Route =
  | { page: 'overview' }
  | { page: 'stage'; stageId: string }
  | { page: 'playoffs' }
  | { page: 'team'; teamId: string }
  | { page: 'match'; teamA: string; teamB: string }
  | { page: 'track-record' }
  | { page: 'odds' }
  | { page: 'methodology' }
  | { page: 'pickem'; stageId?: string }
  | { page: 'not-found' }

export interface Location {
  route: Route
  query: URLSearchParams
}

export function parseHash(hash: string): Location {
  const [path = '', search = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  const query = new URLSearchParams(search)
  const [head, a, b] = parts
  const route: Route = (() => {
    if (!head) return { page: 'overview' }
    if (head === 'stage' && a) return { page: 'stage', stageId: a }
    if (head === 'team' && a) return { page: 'team', teamId: a }
    if (head === 'match' && a && b) return { page: 'match', teamA: a, teamB: b }
    if (head === 'pickem') return a ? { page: 'pickem', stageId: a } : { page: 'pickem' }
    if (
      head === 'playoffs' ||
      head === 'track-record' ||
      head === 'odds' ||
      head === 'methodology'
    ) {
      return { page: head }
    }
    return { page: 'not-found' }
  })()
  return { route, query }
}

export function useLocation(): Location {
  const [location, setLocation] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setLocation(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return location
}

/** Replaces the query part of the current hash without adding a history entry per click. */
export function setQuery(query: URLSearchParams): void {
  const [path = ''] = window.location.hash.replace(/^#/, '').split('?')
  const search = query.toString()
  const next = `#${path}${search ? `?${search}` : ''}`
  window.history.replaceState(null, '', next)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
