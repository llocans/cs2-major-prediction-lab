import { existsSync } from 'node:fs'
import { type Browser, chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Measured, measure } from './ui-measure.ts'

/**
 * Feeds `measure` small pages with one known problem each (and a clean one), so the UI audit can
 * never quietly stop catching what it is meant to catch.
 */
const page = (body: string) => `<!doctype html><html><head><style>
  body { margin: 0; background: #f5f4ef; color: #15171b; font: 14px sans-serif; }
  main { width: 300px; margin: 0 16px; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style></head><body><main>${body}</main></body></html>`

// Skipped where Chromium is not installed (e.g. a cloud session); CI installs it, so it always runs there.
const hasChromium = existsSync(chromium.executablePath())

let browser: Browser

beforeAll(async () => {
  if (hasChromium) browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
})

async function run(body: string, mobile = false): Promise<Measured> {
  const tab = await browser.newPage({ viewport: { width: 375, height: 600 } })
  await tab.setContent(page(body))
  const result = await tab.evaluate(measure, mobile)
  await tab.close()
  return result
}

const kinds = (m: Measured) => m.failures.map((f) => f.kind)

describe.skipIf(!hasChromium)('measure', () => {
  it('passes a clean page', async () => {
    const result = await run('<h1>Stage 1</h1><p>Readable text with room to spare.</p>')
    expect(result.failures).toEqual([])
  })

  it('catches cut-off text', async () => {
    const result = await run('<div class="truncate" style="width:60px">Ninjas in Pyjamas</div>')
    expect(kinds(result)).toContain('cut-off')
  })

  it('catches content sticking out of the page column and a horizontal page scroll', async () => {
    const result = await run('<table style="width:420px"><tr><td>wide</td></tr></table>')
    expect(kinds(result)).toEqual(expect.arrayContaining(['sticks-out', 'page-scroll']))
  })

  it('accepts wide content inside its own scroll box', async () => {
    const result = await run(
      '<div style="overflow-x:auto"><table style="width:420px"><tr><td>wide</td></tr></table></div>',
    )
    expect(result.failures).toEqual([])
  })

  it('catches text drawn over other text', async () => {
    const result = await run(
      '<div style="position:relative;height:20px"><span style="position:absolute;left:0">62%</span><span style="position:absolute;left:4px">38%</span></div>',
    )
    expect(kinds(result)).toContain('overlap')
  })

  it('does not count wrapped lines of one paragraph as overlap', async () => {
    const result = await run(
      '<p><strong>Veto.</strong> The model follows the exact ban and pick order of the event, line after line after line.</p>',
    )
    expect(result.failures).toEqual([])
  })

  it('ignores text in a closed details element', async () => {
    const result = await run(
      '<details><summary>Round 1</summary><div class="truncate" style="width:20px">hidden text</div></details>',
    )
    expect(result.failures).toEqual([])
  })

  it('catches low contrast and passes AA contrast', async () => {
    const low = await run('<p style="color:#868a93">muted</p>')
    expect(low.failures[0]?.detail).toMatch(/^#868a93 on #f5f4ef is 3\.1\d:1/)
    const ok = await run('<p style="color:#666970">muted</p>')
    expect(ok.failures).toEqual([])
  })

  it('warns about crowded small tap targets on mobile only', async () => {
    const body =
      '<button style="width:16px;height:16px;padding:0">a</button><button style="width:16px;height:16px;padding:0;margin-left:2px">b</button>'
    expect((await run(body, true)).warnings.map((w) => w.kind)).toEqual(['tap-target'])
    expect((await run(body, false)).warnings).toEqual([])
  })
})
