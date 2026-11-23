import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'engine/**/*.test.ts',
      'scripts/**/*.test.ts',
      'data/schemas/**/*.test.ts',
      'site/src/lib/**/*.test.ts',
      'site/src/sim/**/*.test.ts',
    ],
    environment: 'node',
  },
})
