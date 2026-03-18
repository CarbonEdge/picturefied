import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession, extractBearerToken } from '../lib/session'

export const followRoutes = new Hono<{ Bindings: Env }>()

// POST /follows/:username — follow
followRoutes.post('/:username', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const username = c.req.param('username')
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?')
    .bind(username)
    .first<{ id: string }>()
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.id === session.userId) return c.json({ error: 'Cannot follow yourself' }, 400)

  try {
    await c.env.DB.prepare(`
      INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)
    `)
      .bind(session.userId, target.id, Date.now())
      .run()
  } catch {
    // Already following — idempotent
  }

  return c.json({ ok: true })
})

// DELETE /follows/:username — unfollow
followRoutes.delete('/:username', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const username = c.req.param('username')
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?')
    .bind(username)
    .first<{ id: string }>()
  if (!target) return c.json({ error: 'User not found' }, 404)

  await c.env.DB.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?')
    .bind(session.userId, target.id)
    .run()

  return c.json({ ok: true })
})

// GET /follows/me — list users I follow
followRoutes.get('/me', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const result = await c.env.DB.prepare(`
    SELECT u.username, u.display_name, u.avatar_url
    FROM follows f
    JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `)
    .bind(session.userId)
    .all<{ username: string; display_name: string | null; avatar_url: string | null }>()

  return c.json(result.results ?? [])
})
