import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db } from '../db/client.js'
import { shares, files, albums } from '../db/schema.js'
import { requireAuth } from '../middleware/auth.js'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateShareSchema = z.object({
  resourceType: z.enum(['file', 'album']),
  resourceId:   z.string().uuid(),
  /**
   * The FEK symmetrically encrypted with the share link key.
   * The share link key is embedded in the URL fragment by the client.
   */
  linkWrappedFek: z.string(),  // base64url
  permissions: z.object({
    view:     z.boolean().default(true),
    download: z.boolean().default(false),
  }).default({ view: true, download: false }),
  expiresAt:      z.string().datetime().optional(),
  maxAccessCount: z.number().int().positive().optional(),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

const sharesRouter = new Hono()

/**
 * POST /shares
 * Create a link share for a file or album.
 * The linkWrappedFek contains the FEK encrypted with a random key that
 * the client has embedded in the URL fragment (never sent to this server).
 */
sharesRouter.post('/', requireAuth, zValidator('json', CreateShareSchema), async (c) => {
  const userId = c.get('userId')
  const body   = c.req.valid('json')

  // Verify the resource exists and is owned by the requester
  if (body.resourceType === 'file') {
    const [file] = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.id, body.resourceId), eq(files.ownerId, userId), isNull(files.deletedAt)))
      .limit(1)
    if (!file) throw new HTTPException(404, { message: 'File not found' })
  } else {
    const [album] = await db
      .select({ id: albums.id })
      .from(albums)
      .where(and(eq(albums.id, body.resourceId), eq(albums.ownerId, userId), isNull(albums.deletedAt)))
      .limit(1)
    if (!album) throw new HTTPException(404, { message: 'Album not found' })
  }

  const shareToken = randomBytes(16).toString('base64url') // 22-char URL-safe token

  const [share] = await db.insert(shares).values({
    grantorId:      userId,
    fileId:         body.resourceType === 'file'  ? body.resourceId : null,
    albumId:        body.resourceType === 'album' ? body.resourceId : null,
    shareToken,
    linkWrappedFek: Buffer.from(body.linkWrappedFek, 'base64url'),
    permissions:    body.permissions,
    expiresAt:      body.expiresAt ? new Date(body.expiresAt) : null,
    maxAccessCount: body.maxAccessCount,
  }).returning({ id: shares.id, shareToken: shares.shareToken, createdAt: shares.createdAt })

  if (!share) throw new HTTPException(500, { message: 'Failed to create share' })

  const publicUrl = `${process.env['PUBLIC_URL']}/s/${share.shareToken}`

  return c.json({
    id:          share.id,
    shareToken:  share.shareToken,
    url:         publicUrl,
    createdAt:   share.createdAt.toISOString(),
  }, 201)
})

/**
 * GET /shares
 * List all active shares created by the authenticated user.
 */
sharesRouter.get('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const rows   = await db
    .select({
      id:             shares.id,
      fileId:         shares.fileId,
      albumId:        shares.albumId,
      shareToken:     shares.shareToken,
      permissions:    shares.permissions,
      accessCount:    shares.accessCount,
      maxAccessCount: shares.maxAccessCount,
      expiresAt:      shares.expiresAt,
      createdAt:      shares.createdAt,
    })
    .from(shares)
    .where(and(eq(shares.grantorId, userId), isNull(shares.revokedAt)))

  return c.json({
    items: rows.map((r) => ({
      ...r,
      url:       `${process.env['PUBLIC_URL']}/s/${r.shareToken}`,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  })
})

/**
 * DELETE /shares/:shareId
 * Revoke a share. The URL fragment key is now useless without this server record.
 */
sharesRouter.delete('/:shareId', requireAuth, async (c) => {
  const userId  = c.get('userId')
  const shareId = c.req.param('shareId')

  const result = await db
    .update(shares)
    .set({ revokedAt: new Date() })
    .where(and(eq(shares.id, shareId), eq(shares.grantorId, userId), isNull(shares.revokedAt)))

  if (!result.count) throw new HTTPException(404, { message: 'Share not found' })
  return c.json({ ok: true })
})

/**
 * GET /s/:token  (PUBLIC — no auth required)
 * Resolve a share link token.
 * Returns the encrypted file download URL and the linkWrappedFek.
 * The client combines this with the key from the URL fragment to decrypt.
 *
 * This endpoint is rate-limited and logs access_count.
 */
sharesRouter.get('/resolve/:token', async (c) => {
  const token = c.req.param('token')

  const [share] = await db
    .select({
      id:             shares.id,
      fileId:         shares.fileId,
      albumId:        shares.albumId,
      linkWrappedFek: shares.linkWrappedFek,
      permissions:    shares.permissions,
      expiresAt:      shares.expiresAt,
      maxAccessCount: shares.maxAccessCount,
      accessCount:    shares.accessCount,
      storageRef:     files.storageReference,
      storageBackend: files.storageBackend,
      thumbnailRef:   files.thumbnailReference,
      blurhash:       files.blurhash,
    })
    .from(shares)
    .leftJoin(files, eq(files.id, shares.fileId))
    .where(and(eq(shares.shareToken, token), isNull(shares.revokedAt)))
    .limit(1)

  if (!share) throw new HTTPException(404, { message: 'Share not found' })

  // Check expiry
  if (share.expiresAt && share.expiresAt < new Date()) {
    throw new HTTPException(410, { message: 'Share has expired' })
  }

  // Check max access count
  if (share.maxAccessCount !== null && share.accessCount >= share.maxAccessCount) {
    throw new HTTPException(410, { message: 'Share access limit reached' })
  }

  // Increment access count asynchronously (don't block the response)
  db.update(shares)
    .set({ accessCount: (share.accessCount ?? 0) + 1 })
    .where(eq(shares.id, share.id))
    .catch(() => { /* non-critical */ })

  return c.json({
    linkWrappedFek: Buffer.from(share.linkWrappedFek!).toString('base64url'),
    permissions:    share.permissions,
    fileId:         share.fileId,
    albumId:        share.albumId,
    blurhash:       share.blurhash,
    // Note: download URL is fetched separately via GET /files/:id/download
    // to enforce per-request presigned URL expiry
  })
})

export default sharesRouter
