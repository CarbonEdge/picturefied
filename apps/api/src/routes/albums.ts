import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { eq, and, isNull, asc } from 'drizzle-orm'
import { db } from '../db/client.js'
import { albums, albumFiles, files } from '../db/schema.js'
import { requireAuth } from '../middleware/auth.js'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateAlbumSchema = z.object({
  /** Encrypted JSON blob: { name, description } */
  encryptedMetadata: z.string(), // base64url
})

const AddFilesSchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1).max(100),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

const albumsRouter = new Hono()

/** POST /albums — create a new album */
albumsRouter.post('/', requireAuth, zValidator('json', CreateAlbumSchema), async (c) => {
  const userId = c.get('userId')
  const body   = c.req.valid('json')

  const [album] = await db.insert(albums).values({
    ownerId:           userId,
    encryptedMetadata: Buffer.from(body.encryptedMetadata, 'base64url'),
  }).returning({ id: albums.id, createdAt: albums.createdAt })

  if (!album) throw new HTTPException(500, { message: 'Failed to create album' })
  return c.json({ id: album.id, createdAt: album.createdAt.toISOString() }, 201)
})

/** GET /albums — list own albums */
albumsRouter.get('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const rows   = await db
    .select({ id: albums.id, encryptedMetadata: albums.encryptedMetadata, createdAt: albums.createdAt })
    .from(albums)
    .where(and(eq(albums.ownerId, userId), isNull(albums.deletedAt)))

  return c.json({
    items: rows.map((r) => ({
      id:                r.id,
      encryptedMetadata: Buffer.from(r.encryptedMetadata!).toString('base64url'),
      createdAt:         r.createdAt.toISOString(),
    })),
  })
})

/** GET /albums/:albumId — album detail with file list */
albumsRouter.get('/:albumId', requireAuth, async (c) => {
  const userId  = c.get('userId')
  const albumId = c.req.param('albumId')

  const [album] = await db
    .select()
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.ownerId, userId), isNull(albums.deletedAt)))
    .limit(1)

  if (!album) throw new HTTPException(404, { message: 'Album not found' })

  const fileRows = await db
    .select({
      id:                  files.id,
      encryptedMetadata:   files.encryptedMetadata,
      wrappedFek:          files.wrappedFek,
      wrappedThumbnailFek: files.wrappedThumbnailFek,
      thumbnailReference:  files.thumbnailReference,
      blurhash:            files.blurhash,
      sortOrder:           albumFiles.sortOrder,
      createdAt:           files.createdAt,
    })
    .from(albumFiles)
    .innerJoin(files, and(eq(files.id, albumFiles.fileId), isNull(files.deletedAt)))
    .where(eq(albumFiles.albumId, albumId))
    .orderBy(asc(albumFiles.sortOrder), asc(files.createdAt))

  return c.json({
    id:                album.id,
    encryptedMetadata: Buffer.from(album.encryptedMetadata!).toString('base64url'),
    createdAt:         album.createdAt.toISOString(),
    files:             fileRows.map((f) => ({
      id:                  f.id,
      encryptedMetadata:   f.encryptedMetadata ? Buffer.from(f.encryptedMetadata).toString('base64url') : null,
      wrappedFek:          f.wrappedFek ? Buffer.from(f.wrappedFek).toString('base64url') : null,
      wrappedThumbnailFek: f.wrappedThumbnailFek ? Buffer.from(f.wrappedThumbnailFek).toString('base64url') : null,
      thumbnailReference:  f.thumbnailReference,
      blurhash:            f.blurhash,
      sortOrder:           f.sortOrder,
      createdAt:           f.createdAt.toISOString(),
    })),
  })
})

/** PATCH /albums/:albumId — update encrypted metadata */
albumsRouter.patch('/:albumId', requireAuth, zValidator('json', CreateAlbumSchema), async (c) => {
  const userId  = c.get('userId')
  const albumId = c.req.param('albumId')
  const body    = c.req.valid('json')

  const result = await db
    .update(albums)
    .set({ encryptedMetadata: Buffer.from(body.encryptedMetadata, 'base64url') })
    .where(and(eq(albums.id, albumId), eq(albums.ownerId, userId), isNull(albums.deletedAt)))

  if (!result.count) throw new HTTPException(404, { message: 'Album not found' })
  return c.json({ ok: true })
})

/** DELETE /albums/:albumId — soft-delete the album (files are unaffected) */
albumsRouter.delete('/:albumId', requireAuth, async (c) => {
  const userId  = c.get('userId')
  const albumId = c.req.param('albumId')

  const result = await db
    .update(albums)
    .set({ deletedAt: new Date() })
    .where(and(eq(albums.id, albumId), eq(albums.ownerId, userId), isNull(albums.deletedAt)))

  if (!result.count) throw new HTTPException(404, { message: 'Album not found' })
  return c.json({ ok: true })
})

/** POST /albums/:albumId/files — add files to album */
albumsRouter.post('/:albumId/files', requireAuth, zValidator('json', AddFilesSchema), async (c) => {
  const userId  = c.get('userId')
  const albumId = c.req.param('albumId')
  const body    = c.req.valid('json')

  const [album] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.ownerId, userId), isNull(albums.deletedAt)))
    .limit(1)

  if (!album) throw new HTTPException(404, { message: 'Album not found' })

  // Only add files owned by this user
  const ownedFiles = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerId, userId), isNull(files.deletedAt)))

  const ownedIds = new Set(ownedFiles.map((f) => f.id))
  const toInsert = body.fileIds
    .filter((id) => ownedIds.has(id))
    .map((fileId, idx) => ({ albumId, fileId, sortOrder: idx }))

  if (toInsert.length > 0) {
    await db.insert(albumFiles).values(toInsert).onConflictDoNothing()
  }

  return c.json({ added: toInsert.length })
})

/** DELETE /albums/:albumId/files/:fileId — remove file from album */
albumsRouter.delete('/:albumId/files/:fileId', requireAuth, async (c) => {
  const userId  = c.get('userId')
  const albumId = c.req.param('albumId')
  const fileId  = c.req.param('fileId')

  // Verify album ownership
  const [album] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.ownerId, userId), isNull(albums.deletedAt)))
    .limit(1)

  if (!album) throw new HTTPException(404, { message: 'Album not found' })

  await db.delete(albumFiles)
    .where(and(eq(albumFiles.albumId, albumId), eq(albumFiles.fileId, fileId)))

  return c.json({ ok: true })
})

export default albumsRouter
