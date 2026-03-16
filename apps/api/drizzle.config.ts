import type { Config } from 'drizzle-kit'

const config: Config = {
  schema:    './src/db/schema.ts',
  out:       './src/db/migrations',
  dialect:   'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://picturefied:changeme@localhost:5432/picturefied',
  },
}

export default config
