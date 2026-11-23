import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
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

export default defineConfig({
  root: 'site',
  // Relative asset paths so the static build works from any host path.
  base: './',
  plugins: [react(), tailwindcss(), engineVersion()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, fs: { allow: ['..'] } },
  worker: { format: 'es' },
})
