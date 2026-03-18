/**
 * Picturefied API — Hono on Cloudflare Workers.
 *
 * Social registry + feed API backed by D1 (social graph) and KV (sessions,
 * tag indices, feed cache). Authentication via Google Sign-In (OIDC).
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRoutes } from './routes/auth'
import { userRoutes } from './routes/users'
import { followRoutes } from './routes/follows'
import { postRoutes } from './routes/posts'
import { feedRoutes } from './routes/feed'
import { keyRoutes } from './routes/keys'

export interface Env {
  // wrangler.toml [vars] — not secret
  APP_NAME: string
  API_DOMAIN: string
  WEBSITE_DOMAIN: string
  GOOGLE_CLIENT_ID: string
  // wrangler secret put — never in wrangler.toml
  JWT_SECRET: string
  // D1
  DB: D1Database
  // KV
  SESSIONS: KVNamespace
  TAG_INDEX: KVNamespace
  FEED_CACHE: KVNamespace
}

const app = new Hono<{ Bindings: Env }>()

// CORS — must run before route handlers
app.use('*', async (c, next) => {
  const corsHandler = cors({
    origin: c.env.WEBSITE_DOMAIN,
    allowHeaders: ['content-type', 'authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  })
  return corsHandler(c, next)
})

// Routes
app.get('/health', (c) => c.json({ ok: true }))
app.route('/auth', authRoutes)
app.route('/users', userRoutes)
app.route('/follows', followRoutes)
app.route('/posts', postRoutes)
app.route('/feed', feedRoutes)
app.route('/api-keys', keyRoutes)

app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
