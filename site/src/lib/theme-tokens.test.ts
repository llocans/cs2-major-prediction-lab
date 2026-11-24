import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** The dark tokens are written twice in theme.css (picked theme and system theme); keep them equal. */
describe('theme.css dark tokens', () => {
  const css = readFileSync(new URL('../theme.css', import.meta.url), 'utf8')
  const tokens = (selector: string) => {
    const start = css.indexOf(selector)
    const body = css.slice(start, css.indexOf('}', start))
    return [...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => `${m[1]}=${m[2]}`)
  }
  it('has the same values for a picked dark theme and a dark system', () => {
    const picked = tokens(':root[data-theme="dark"] {')
    expect(picked.length).toBeGreaterThan(5)
    expect(tokens(':root:not([data-theme="light"]) {')).toEqual(picked)
  })
})
