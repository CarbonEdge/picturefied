import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession, extractBearerToken } from '../lib/session'

export const userRoutes = new Hono<{ Bindings: Env }>()

interface UserRow {
  id: string
  username: string
  display_name: string | null
  drive_folder_id: string | null
  account_type: string
  avatar_url: string | null
  bio: string | null
  created_at: number
}

function formatPublicUser(user: UserRow) {
  return {
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    accountType: user.account_type,
    createdAt: user.created_at,
  }
}

function formatUser(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    accountType: user.account_type,
    driveFolderId: user.drive_folder_id,
    createdAt: user.created_at,
  }
}

// GET /users/:username — public profile
userRoutes.get('/:username', async (c) => {
  const username = c.req.param('username')
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?')
    .bind(username)
    .first<UserRow>()
  if (!user) return c.json({ error: 'User not found' }, 404)
  return c.json(formatPublicUser(user))
})

// POST /users/register — create/update username (requires session)
userRoutes.post('/register', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  let body: { username?: string; accountType?: string }
  try {
    body = await c.req.json<{ username?: string; accountType?: string }>()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  if (!body.username) return c.json({ error: 'Missing username' }, 400)

  if (!/^[a-z0-9_]{3,30}$/.test(body.username)) {
    return c.json(
      { error: 'Username must be 3-30 chars: lowercase letters, numbers, underscores' },
      400,
    )
  }

  try {
    await c.env.DB.prepare(`
      UPDATE users SET username = ?, account_type = ?
      WHERE id = ?
    `)
      .bind(body.username, body.accountType ?? 'human', session.userId)
      .run()
  } catch {
    return c.json({ error: 'Username already taken' }, 409)
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(session.userId)
    .first<UserRow>()

  return c.json(formatUser(user!))
})

// PATCH /users/me — update bio / display_name / drive_folder_id
userRoutes.patch('/me', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  let body: { bio?: string; displayName?: string; driveFolderId?: string }
  try {
    body = await c.req.json<{ bio?: string; displayName?: string; driveFolderId?: string }>()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  await c.env.DB.prepare(`
    UPDATE users SET
      bio             = COALESCE(?, bio),
      display_name    = COALESCE(?, display_name),
      drive_folder_id = COALESCE(?, drive_folder_id)
    WHERE id = ?
  `)
    .bind(body.bio ?? null, body.displayName ?? null, body.driveFolderId ?? null, session.userId)
    .run()

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(session.userId)
    .first<UserRow>()

  return c.json(formatUser(user!))
})
