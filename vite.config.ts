import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * `virtual:engine-version`: a hash of the engine's source. The site's simulation cache keys on it, so
 * a cached result is never reused after the engine changes (also while the dev server keeps running).
 */
function engineVersion(): Plugin {
  const id = 'virtual:engine-version'
  const resolved = `\0${id}`
  const dir = fileURLToPath(new URL('./engine', import.meta.url))
  const hash = () => {
    const h = createHash('sha256')
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .sort()
    for (const file of files) h.update(file).update(readFileSync(join(dir, file)))
    return h.digest('hex').slice(0, 16)
  }
  return {
    name: 'engine-version',
    resolveId: (source) => (source === id ? resolved : undefined),
    load: (moduleId) =>
      moduleId === resolved ? `export default ${JSON.stringify(hash())}` : undefined,
    handleHotUpdate({ file, server }) {
      if (!file.startsWith(dir)) return
      const mod = server.moduleGraph.getModuleById(resolved)
      if (mod) server.moduleGraph.invalidateModule(mod)
    },
  }
}

/**
 * The site never names the bookmaker behind `bookmaker-odds.json` (`docs/sources.md`): each entry's
 * source is bundled as a generic name, with no URL. The committed file keeps the full source.
 */
function genericBookmakerSource(): Plugin {
  return {
    name: 'generic-bookmaker-source',
    // Before Vite's JSON plugin turns the file into a module.
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]data[\\/]events[\\/][^\\/]+[\\/]bookmaker-odds\.json$/.test(id)) return undefined
      const file = JSON.parse(code) as { entries?: Array<{ source?: Record<string, unknown> }> }
      for (const entry of file.entries ?? []) {
        if (entry.source) {
          entry.source = {
            name: 'Pre-match odds, margin removed',
            retrievedAt: entry.source.retrievedAt,
          }
        }
      }
      return { code: JSON.stringify(file), map: null }
    },
  }
}

/**
 * `virtual:local-market-odds`: the bookmaker's own decimal odds (git-ignored
 * `data/events/<id>/local/market-odds.json`), for real bet slip payouts on this Mac. Only the dev
 * server serves them; `npm run build` gets an empty object, so a built site never contains them
 * (`docs/sources.md`).
 */
function localMarketOdds(): Plugin {
  const id = 'virtual:local-market-odds'
  const resolved = `\0${id}`
  let serve = false
  return {
    name: 'local-market-odds',
    configResolved(config) {
      serve = config.command === 'serve'
    },
    resolveId: (source) => (source === id ? resolved : undefined),
    load(moduleId) {
      if (moduleId !== resolved) return undefined
      if (!serve) return 'export default {}'
      const root = fileURLToPath(new URL('./data/events', import.meta.url))
      const byEvent: Record<string, unknown> = {}
      for (const event of readdirSync(root)) {
        const file = join(root, event, 'local', 'market-odds.json')
        if (!existsSync(file)) continue
        this.addWatchFile(file)
        byEvent[event] = JSON.parse(readFileSync(file, 'utf8'))
      }
      return `export default ${JSON.stringify(byEvent)}`
    },
  }
}

export default defineConfig({
  root: 'site',
  // Relative asset paths so the static build works from any host path.
  base: './',
  plugins: [genericBookmakerSource(), react(), tailwindcss(), engineVersion(), localMarketOdds()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, fs: { allow: ['..'] } },
  worker: { format: 'es' },
})
