import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/__tests__/**', 'src/workers/**'],
    },
  },
})
