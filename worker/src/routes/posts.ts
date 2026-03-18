import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession, extractBearerToken } from '../lib/session'

export const postRoutes = new Hono<{ Bindings: Env }>()

interface TagIndexEntry {
  postId: string
  authorId: string
  ts: number
}

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

async function resolveAuth(
  env: Env,
  authHeader: string | undefined,
): Promise<{ userId: string } | null> {
  if (!authHeader) return null

  // API key path: keys start with pk_
  if (authHeader.startsWith('Bearer pk_')) {
    const apiKey = authHeader.slice(7)
    const keyHash = await hashApiKey(apiKey, env.JWT_SECRET)
    const row = await env.DB.prepare('SELECT owner_id FROM api_keys WHERE key_hash = ?')
      .bind(keyHash)
      .first<{ owner_id: string }>()
    if (!row) return null

    await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?')
      .bind(Date.now(), keyHash)
      .run()

    return { userId: row.owner_id }
  }

  // Session token path
  const token = extractBearerToken(authHeader)
  if (!token) return null

  const session = await getSession(env.SESSIONS, token)
  return session ? { userId: session.userId } : null
}

// POST /posts — publish post
postRoutes.post('/', async (c) => {
  const auth = await resolveAuth(c.env, c.req.header('authorization'))
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  let body: {
    driveFileId?: string
    drivePublicUrl?: string
    title?: string
    tags?: string[]
    isPublic?: boolean
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  if (!body.driveFileId) return c.json({ error: 'Missing driveFileId' }, 400)

  const id = crypto.randomUUID()
  const tags = body.tags ?? []
  const isPublic = body.isPublic !== false ? 1 : 0
  const now = Date.now()

  await c.env.DB.prepare(`
    INSERT INTO posts (id, author_id, drive_file_id, drive_public_url, title, tags, is_public, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      id,
      auth.userId,
      body.driveFileId,
      body.drivePublicUrl ?? null,
      body.title ?? null,
      JSON.stringify(tags),
      isPublic,
      now,
    )
    .run()

  // Update KV tag index for each tag on public posts with a public URL
  if (isPublic === 1 && body.drivePublicUrl) {
    const entry: TagIndexEntry = { postId: id, authorId: auth.userId, ts: now }
    for (const tag of tags) {
      const rawIndex = await c.env.TAG_INDEX.get(`tag:${tag}`)
      const entries: TagIndexEntry[] = rawIndex
        ? (JSON.parse(rawIndex) as TagIndexEntry[])
        : []
      entries.unshift(entry)
      await c.env.TAG_INDEX.put(`tag:${tag}`, JSON.stringify(entries.slice(0, 100)))
    }
  }

  return c.json({ id, ok: true }, 201)
})

// GET /posts/:id — single post
postRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  interface PostRow {
    id: string
    author_id: string
    author_username: string
    drive_file_id: string
    drive_public_url: string | null
    title: string | null
    tags: string
    is_public: number
    created_at: number
  }

  const post = await c.env.DB.prepare(`
    SELECT p.*, u.username as author_username
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.id = ?
  `)
    .bind(id)
    .first<PostRow>()

  if (!post) return c.json({ error: 'Post not found' }, 404)
  if (!post.is_public) return c.json({ error: 'Post is private' }, 403)

  return c.json({
    id: post.id,
    authorId: post.author_id,
    authorUsername: post.author_username,
    driveFileId: post.drive_file_id,
    drivePublicUrl: post.drive_public_url,
    title: post.title,
    tags: JSON.parse(post.tags) as string[],
    isPublic: true,
    createdAt: post.created_at,
  })
})

// DELETE /posts/:id — delete own post
postRoutes.delete('/:id', async (c) => {
  const auth = await resolveAuth(c.env, c.req.header('authorization'))
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')
  const post = await c.env.DB.prepare('SELECT author_id FROM posts WHERE id = ?')
    .bind(id)
    .first<{ author_id: string }>()

  if (!post) return c.json({ error: 'Post not found' }, 404)
  if (post.author_id !== auth.userId) return c.json({ error: 'Forbidden' }, 403)

  await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run()

  return c.json({ ok: true })
})
