import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { resolve } from 'path'

// GitHub Pages deploys to /<repo-name>/ — set via env or default to '/'
const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // The libsodium-wrappers-sumo ESM build references a missing file.
      // Use the CJS build instead — it has the WASM binary embedded as base64.
      'libsodium-wrappers-sumo': resolve(
        __dirname,
        'node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js',
      ),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          crypto: ['libsodium-wrappers-sumo', '@scure/bip39'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
})
