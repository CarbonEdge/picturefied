/**
 * Picturefied auth worker — Hono + SuperTokens on Cloudflare Workers.
 *
 * SuperTokens handles authentication. This worker is the backend the
 * frontend SDK talks to. It adapts the SuperTokens "custom" framework to
 * Cloudflare Workers (which use the Fetch API, not Node.js http).
 *
 * Routes under /auth/* are handled by SuperTokens.
 * The /health endpoint is public.
 * The /sessioninfo endpoint requires a valid session.
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import supertokens from 'supertokens-node'
import Session from 'supertokens-node/recipe/session'
import EmailPassword from 'supertokens-node/recipe/emailpassword'
import { middleware as stMiddleware, errorHandler as stErrorHandler } from 'supertokens-node/framework/custom'
import { verifySession } from 'supertokens-node/recipe/session/framework/custom'

export interface Env {
  // Set in wrangler.toml [vars] — not secret
  SUPERTOKENS_CONNECTION_URI: string
  API_DOMAIN: string
  WEBSITE_DOMAIN: string
  APP_NAME: string
  // Set via `wrangler secret put` — never in wrangler.toml
  SUPERTOKENS_API_KEY: string
}

// SuperTokens is initialised once per Worker instance (stays warm in CF)
let initialised = false

function ensureInit(env: Env) {
  if (initialised) return
  supertokens.init({
    framework: 'custom',
    supertokens: {
      connectionURI: env.SUPERTOKENS_CONNECTION_URI,
      apiKey: env.SUPERTOKENS_API_KEY,
    },
    appInfo: {
      appName: env.APP_NAME,
      apiDomain: env.API_DOMAIN,
      websiteDomain: env.WEBSITE_DOMAIN,
      apiBasePath: '/auth',
      websiteBasePath: '/',
    },
    recipeList: [
      EmailPassword.init(),
      Session.init({
        // Needed for cross-origin requests (GitHub Pages → Cloudflare Workers)
        cookieSameSite: 'none',
        cookieSecure: true,
        antiCsrf: 'VIA_CUSTOM_HEADER',
      }),
    ],
  })
  initialised = true
}

const app = new Hono<{ Bindings: Env }>()

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Must run before SuperTokens middleware — ST needs CORS headers on pre-flights.
app.use('*', async (c, next) => {
  ensureInit(c.env)
  const corsHandler = cors({
    origin: c.env.WEBSITE_DOMAIN,
    allowHeaders: ['content-type', 'st-auth-mode', ...supertokens.getAllCORSHeaders()],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
  return corsHandler(c, next)
})

// ─── SuperTokens auth routes (/auth/*) ───────────────────────────────────────
// The custom framework middleware takes the raw Request and returns a Response
// when SuperTokens handles the route, or undefined to fall through.
app.all('/auth/*', async (c) => {
  ensureInit(c.env)
  const handler = stMiddleware()

  // Give SuperTokens the raw Fetch API Request; it returns a raw Response
  const res = await handler(c.req.raw)
  if (res !== undefined) return res

  // Not handled by SuperTokens — shouldn't happen under /auth/* but be safe
  return c.json({ error: 'Route not handled' }, 404)
})

// ─── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true }))

// ─── Protected example route ─────────────────────────────────────────────────
// Returns the current session info — useful for testing auth works end-to-end.
app.get('/session', async (c) => {
  ensureInit(c.env)
  const sessionHandler = verifySession()

  const res = await sessionHandler(c.req.raw, async (err, session) => {
    if (err) {
      return stErrorHandler()(err, c.req.raw)
    }
    return new Response(
      JSON.stringify({
        userId: session!.getUserId(),
        handle: session!.getHandle(),
        accessTokenPayload: session!.getAccessTokenPayload(),
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  })

  return res
})

// ─── Catch-all ────────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
