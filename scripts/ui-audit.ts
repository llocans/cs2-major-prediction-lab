/**
 * Measured UI checks on the built site, in a real browser (Playwright, Chromium).
 *
 * Opens every page linked from the nav at desktop (1440x900) and mobile (375x812) widths, in the
 * light and dark themes, waits for the simulation to finish and measures:
 *
 * Failures (exit code 1):
 *  - console errors and uncaught page errors
 *  - horizontal page scroll
 *  - cut-off text (an ellipsis is showing)
 *  - content that sticks out of the page column without a scroll box of its own
 *  - text drawn over other text
 *  - text contrast under WCAG AA (4.5:1, or 3:1 for large text)
 * Warnings (listed in the report, not failing):
 *  - mobile tap targets under 24 px that sit closer than 24 px to another target (WCAG 2.5.8)
 *
 * Writes `.ui-audit/report.md` and a full-page screenshot per page, width and theme, so a reviewer
 * (the `ui-review` skill) can look at exactly what was measured. On a pass it stamps the site's
 * fingerprint in `.claude/state/` for the Stop hook.
 *
 * Usage: node scripts/ui-audit.ts [--no-build]
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { preview } from 'vite'
import { AUDIT_STAMP, siteFingerprint } from './lib/site-fingerprint.ts'
import { measure } from './lib/ui-measure.ts'

const root = join(import.meta.dirname, '..')
const outDir = join(root, '.ui-audit')

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
] as const
const THEMES = ['light', 'dark'] as const

if (!process.argv.includes('--no-build')) {
  const build = spawnSync('npx', ['vite', 'build', '--logLevel', 'warn'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

// vite.config.ts sets `root: 'site'` relative to the working directory.
process.chdir(root)
const server = await preview({ preview: { port: 0, open: false }, logLevel: 'warn' })
const base = server.resolvedUrls?.local[0]
if (!base) throw new Error('Preview server did not start')

const browser = await chromium.launch()
const page = await browser.newPage()
let pageErrors: string[] = []
page.on('console', (msg) => {
  if (msg.type() === 'error') pageErrors.push(msg.text())
})
page.on('pageerror', (error) => pageErrors.push(error.message))

await page.goto(base)
await page.waitForSelector('nav a[href^="#/"]')
const routes = await page.$$eval('nav a[href^="#/"]', (links) => [
  ...new Set(links.map((a) => a.getAttribute('href') ?? '#/')),
])

const sections: string[] = []
let failureCount = 0
let warningCount = 0

for (const route of routes) {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      pageErrors = []
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.emulateMedia({ colorScheme: theme })
      await page.goto(`${base}${route}`)
      const settled = await waitForSimulation(page)
      const measured = await page.evaluate(measure, viewport.name === 'mobile')
      if (!settled) measured.failures.push({ kind: 'simulation', detail: 'did not finish in 90 s' })
      for (const error of pageErrors) measured.failures.push({ kind: 'console', detail: error })

      const label = `${route} · ${viewport.name} · ${theme}`
      const name = `${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'overview'}-${viewport.name}-${theme}`
      const shot = `${name}.png`
      await page.screenshot({ path: join(outDir, shot), fullPage: true })
      // Each block of the page on its own, sharp enough for a reviewer to read small text.
      let block = 0
      for (const element of await page.$$('main > * > *, main aside')) {
        const box = await element.boundingBox()
        if (!box || box.width < 40 || box.height < 40) continue
        block++
        await element.screenshot({ path: join(outDir, `${name}-block${block}.png`) })
      }

      failureCount += measured.failures.length
      warningCount += measured.warnings.length
      const lines = [
        ...measured.failures.map((i) => `- FAIL ${i.kind}: ${i.detail}`),
        ...measured.warnings.map((i) => `- warn ${i.kind}: ${i.detail}`),
      ]
      sections.push(`## ${label}\n\nScreenshot: \`${shot}\`\n\n${lines.join('\n') || '- clean'}\n`)
      console.log(
        `${measured.failures.length ? 'FAIL' : 'ok  '} ${label}` +
          (measured.failures.length ? ` (${measured.failures.length})` : '') +
          (measured.warnings.length ? ` · ${measured.warnings.length} warnings` : ''),
      )
    }
  }
}

await browser.close()
await new Promise<void>((resolve) => server.httpServer.close(() => resolve()))

const report = `# UI audit\n\n${failureCount} failures, ${warningCount} warnings across ${routes.length} pages x ${VIEWPORTS.length} widths x ${THEMES.length} themes.\n\n${sections.join('\n')}`
writeFileSync(join(outDir, 'report.md'), report)
console.log(`\n${failureCount} failures, ${warningCount} warnings. Report: .ui-audit/report.md`)

if (failureCount > 0) process.exit(1)
const stamp = join(root, AUDIT_STAMP)
mkdirSync(dirname(stamp), { recursive: true })
writeFileSync(stamp, JSON.stringify({ fingerprint: siteFingerprint(root), at: new Date() }))

/** Waits until no "Simulating" text or grey "rough" numbers remain. False on timeout. */
async function waitForSimulation(p: Page): Promise<boolean> {
  try {
    await p.waitForFunction(
      () =>
        document.querySelector('main') !== null &&
        document.querySelector('[data-rough]') === null &&
        !document.body.innerText.includes('Simulating'),
      undefined,
      { timeout: 90_000, polling: 250 },
    )
    await p.evaluate(() => document.fonts.ready)
    return true
  } catch {
    return false
  }
}
