import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Every page uses the shared frame (`components/Page.tsx`), so headings, header spacing and the
 * space between sections are the same everywhere. A page with its own `<h1>` or root gap drifts.
 */
describe('pages use the shared Page and PageHeader', () => {
  const dir = new URL('../pages/', import.meta.url)
  const pages = readdirSync(dir).filter((f) => f.endsWith('Page.tsx'))

  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThan(5)
  })
  for (const file of pages) {
    const source = readFileSync(new URL(file, dir), 'utf8')
    it(`${file} has no hand-made <h1> and uses <Page>`, () => {
      expect(source).not.toMatch(/<h1[\s>]/)
      expect(source).toMatch(/<Page[\s>]/)
    })
  }
})
