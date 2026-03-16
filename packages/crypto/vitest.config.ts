import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'crypto',
    environment: 'node',
    // libsodium-wrappers uses WASM — allow enough time for initialization
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
    },
  },
})
