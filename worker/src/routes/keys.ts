import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession, extractBearerToken } from '../lib/session'

export const keyRoutes = new Hono<{ Bindings: Env }>()

async function hashApiKey(key: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(key))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// POST /api-keys — generate API key for AI agents
keyRoutes.post('/', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  let body: { name?: string; scopes?: string[] }
  try {
    body = await c.req.json<{ name?: string; scopes?: string[] }>()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  if (!body.name) return c.json({ error: 'Missing name' }, 400)

  const id = crypto.randomUUID()
  const rawKey =
    'pk_' +
    Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

  const keyHash = await hashApiKey(rawKey, c.env.JWT_SECRET)
  const scopes = body.scopes ?? ['publish']
  const now = Date.now()

  await c.env.DB.prepare(`
    INSERT INTO api_keys (id, owner_id, key_hash, name, scopes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
    .bind(id, session.userId, keyHash, body.name, JSON.stringify(scopes), now)
    .run()

  // Return raw key only once — caller must store it
  return c.json({ id, key: rawKey, name: body.name, scopes, createdAt: now }, 201)
})

// DELETE /api-keys/:id — revoke key
keyRoutes.delete('/:id', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const key = await c.env.DB.prepare('SELECT owner_id FROM api_keys WHERE id = ?')
    .bind(id)
    .first<{ owner_id: string }>()

  if (!key) return c.json({ error: 'Not found' }, 404)
  if (key.owner_id !== session.userId) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// GET /api-keys — list my keys
keyRoutes.get('/', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  interface KeyRow {
    id: string
    name: string
    scopes: string
    created_at: number
    last_used_at: number | null
  }

  const result = await c.env.DB.prepare(`
    SELECT id, name, scopes, created_at, last_used_at
    FROM api_keys WHERE owner_id = ?
    ORDER BY created_at DESC
  `)
    .bind(session.userId)
    .all<KeyRow>()

  const keys = (result.results ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    scopes: JSON.parse(k.scopes) as string[],
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
  }))

  return c.json(keys)
})
