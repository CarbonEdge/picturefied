import { Hono } from 'hono'
import type { Env } from '../index'
import { verifyGoogleIdToken } from '../lib/verify-google-jwt'
import {
  createSession,
  refreshSession,
  deleteSession,
  extractBearerToken,
  getSession,
} from '../lib/session'

export const authRoutes = new Hono<{ Bindings: Env }>()

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

// POST /auth/google — verify Google ID token → issue session
authRoutes.post('/google', async (c) => {
  let body: { credential?: string }
  try {
    body = await c.req.json<{ credential?: string }>()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  if (!body.credential) {
    return c.json({ error: 'Missing credential' }, 400)
  }

  let payload
  try {
    payload = await verifyGoogleIdToken(body.credential, c.env.GOOGLE_CLIENT_ID)
  } catch {
    return c.json({ error: 'Invalid Google token' }, 401)
  }

  const { sub, email, name, picture } = payload
  const now = Date.now()

  // Generate a default username from email (will be updated on registration)
  const defaultUsername = email.split('@')[0]!.replace(/[^a-z0-9_]/g, '_').slice(0, 26) + '_' + sub.slice(-4)

  // Upsert user — on first login, create the record
  await c.env.DB.prepare(`
    INSERT INTO users (id, username, display_name, avatar_url, account_type, created_at)
    VALUES (?, ?, ?, ?, 'human', ?)
    ON CONFLICT (id) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, display_name),
      avatar_url   = COALESCE(excluded.avatar_url, avatar_url)
  `)
    .bind(sub, defaultUsername, name ?? null, picture ?? null, now)
    .run()

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(sub)
    .first<UserRow>()

  const sessionToken = await createSession(c.env.SESSIONS, sub)

  // isNewUser = username still has the auto-generated suffix (not yet chosen)
  const isNewUser = user?.username.endsWith('_' + sub.slice(-4)) && !user.drive_folder_id

  return c.json({
    sessionToken,
    user: formatUser(user!),
    isNewUser,
  })
})

// POST /auth/refresh — extend session (sliding window)
authRoutes.post('/refresh', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await refreshSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Session not found or expired' }, 401)

  return c.json({ expiresAt: session.expiresAt })
})

// DELETE /auth/session — logout
authRoutes.delete('/session', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (token) await deleteSession(c.env.SESSIONS, token)
  return c.json({ ok: true })
})

// GET /auth/me — get current user from session (convenience)
authRoutes.get('/me', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(session.userId)
    .first<UserRow>()

  if (!user) return c.json({ error: 'User not found' }, 404)

  return c.json(formatUser(user))
})
