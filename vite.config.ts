import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'site',
  // Relative asset paths so the static build works from any host path.
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, fs: { allow: ['..'] } },
  worker: { format: 'es' },
})
