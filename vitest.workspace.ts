import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/crypto/vitest.config.ts',
  'packages/storage/vitest.config.ts',
  'apps/api/vitest.config.ts',
  'apps/web/vitest.config.ts',
])
