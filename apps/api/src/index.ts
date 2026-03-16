import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import { createStorageAdapterFromEnv } from '@picturefied/storage'
import authRouter   from './routes/auth.js'
import keysRouter   from './routes/keys.js'
import sharesRouter from './routes/shares.js'
import albumsRouter from './routes/albums.js'
import { createFilesRouter } from './routes/files.js'

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const storage = createStorageAdapterFromEnv()

const health = await storage.healthCheck()
if (!health.ok) {
  console.error(`[storage] Health check failed: ${health.message}`)
  process.exit(1)
}
console.log('[storage] Backend ready:', process.env['STORAGE_BACKEND'] ?? 'local')

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono()

app.use('*', logger())
app.use('*', cors({
  origin: process.env['PUBLIC_URL'] ?? 'http://localhost:3000',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// ─── Routes ───────────────────────────────────────────────────────────────────

const api = new Hono()

api.route('/auth',    authRouter)
api.route('/keys',    keysRouter)
api.route('/files',   createFilesRouter(storage))
api.route('/albums',  albumsRouter)
api.route('/shares',  sharesRouter)

// Public share resolution endpoint (mounted at /s/:token for short URLs)
api.get('/s/:token', (c) => {
  return c.redirect(`/api/v1/shares/resolve/${c.req.param('token')}`)
})

app.route('/api/v1', api)

// ─── Health endpoint ──────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ ok: true, version: '0.1.0' }))

// ─── Error handling ───────────────────────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error('[unhandled]', err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

// ─── Start ────────────────────────────────────────────────────────────────────

const port = parseInt(process.env['PORT'] ?? '8787')
serve({ fetch: app.fetch, port }, () => {
  console.log(`[api] Listening on http://localhost:${port}`)
})

export default app
