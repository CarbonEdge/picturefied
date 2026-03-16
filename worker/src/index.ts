/**
 * Picturefied auth worker — Hono + SuperTokens on Cloudflare Workers.
 *
 * SuperTokens handles authentication. This worker is the backend the
 * frontend SDK talks to. It adapts the SuperTokens "custom" framework to
 * Cloudflare Workers (which use the Fetch API, not Node.js http).
 *
 * Routes under /auth/* are handled by SuperTokens.
 * The /health endpoint is public.
 * The /session endpoint requires a valid session.
 */
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import supertokens from 'supertokens-node'
import Session from 'supertokens-node/recipe/session'
import EmailPassword from 'supertokens-node/recipe/emailpassword'
import {
  middleware as stMiddleware,
  errorHandler as stErrorHandler,
  PreParsedRequest,
  CollectingResponse,
} from 'supertokens-node/framework/custom'
import type { HTTPMethod } from 'supertokens-node/types'
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a Hono context's request as a SuperTokens PreParsedRequest. */
async function toSTParsedRequest(c: Context): Promise<PreParsedRequest> {
  const url = new URL(c.req.url)
  const cookies: Record<string, string> = {}
  for (const part of (c.req.header('cookie') ?? '').split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    cookies[decodeURIComponent(part.slice(0, idx).trim())] = decodeURIComponent(
      part.slice(idx + 1).trim(),
    )
  }

  const contentType = c.req.header('content-type') ?? ''
  const getJSONBody = async () => {
    if (contentType.includes('application/json')) return c.req.json()
    return {}
  }
  const getFormBody = async () => {
    if (contentType.includes('application/x-www-form-urlencoded')) return c.req.parseBody()
    return {}
  }

  return new PreParsedRequest({
    method: c.req.method.toLowerCase() as HTTPMethod,
    url: url.toString(),
    headers: c.req.raw.headers,
    cookies,
    query: Object.fromEntries(url.searchParams),
    getJSONBody,
    getFormBody,
  })
}

/**
 * Convert a CollectingResponse to a web Response, including cookies.
 * CollectingResponse.cookies is an array of CookieInfo; each must become
 * a separate Set-Cookie header (Headers.append supports duplicates).
 */
function toWebResponse(stRes: CollectingResponse): Response {
  const headers = new Headers(stRes.headers)

  for (const cookie of stRes.cookies) {
    const parts = [
      `${encodeURIComponent(cookie.key)}=${encodeURIComponent(cookie.value)}`,
      `Path=${cookie.path}`,
      `SameSite=${cookie.sameSite}`,
    ]
    if (cookie.domain) parts.push(`Domain=${cookie.domain}`)
    if (cookie.secure) parts.push('Secure')
    if (cookie.httpOnly) parts.push('HttpOnly')
    if (cookie.expires) parts.push(`Expires=${new Date(cookie.expires).toUTCString()}`)
    headers.append('Set-Cookie', parts.join('; '))
  }

  return new Response(stRes.body ?? null, {
    status: stRes.statusCode,
    headers,
  })
}

// ─── App ──────────────────────────────────────────────────────────────────────

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
app.all('/auth/*', async (c): Promise<Response> => {
  ensureInit(c.env)
  const stReq = await toSTParsedRequest(c)
  const stRes = new CollectingResponse()

  const result = await stMiddleware()(stReq, stRes)

  if (result.error) {
    await stErrorHandler()(result.error, stReq, stRes, (_err: Error) => {
      stRes.setStatusCode(500)
      stRes.sendJSONResponse({ error: 'Internal server error' })
    })
    return toWebResponse(stRes)
  }

  if (result.handled) {
    return toWebResponse(stRes)
  }

  return new Response(JSON.stringify({ error: 'Route not handled' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  })
})

// ─── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true }))

// ─── Protected: session info ──────────────────────────────────────────────────
// Returns the current session — useful for testing auth works end-to-end.
app.get('/session', async (c): Promise<Response> => {
  ensureInit(c.env)
  const stReq = await toSTParsedRequest(c)
  const stRes = new CollectingResponse()

  await verifySession()(stReq, stRes)

  // verifySession sets stReq.session on success, or writes an error response
  if (stRes.statusCode !== 200) {
    return toWebResponse(stRes)
  }

  const session = stReq.session
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      userId: session.getUserId(),
      handle: session.getHandle(),
      accessTokenPayload: session.getAccessTokenPayload(),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
})

// ─── Catch-all ────────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404))

export default app
