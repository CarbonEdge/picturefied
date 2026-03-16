import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db/client.js'
import { files } from '../db/schema.js'
import { requireAuth } from '../middleware/auth.js'
import type { StorageAdapter } from '@picturefied/storage'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const UploadIntentSchema = z.object({
  sizeBytes:    z.number().int().positive().max(Number(process.env['MAX_UPLOAD_BYTES'] ?? 2_147_483_648)),
  mimeTypeHint: z.string().optional(),
})

const UploadCompleteSchema = z.object({
  fileId:              z.string().uuid(),
  wrappedFek:          z.string(),   // base64url
  encryptedMetadata:   z.string(),   // base64url
  thumbnailReference:  z.string().optional(),
  wrappedThumbnailFek: z.string().optional(),
  blurhash:            z.string().max(100).optional(),
  contentHash:         z.string().optional(), // base64url BLAKE2b-256
})

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createFilesRouter(storage: StorageAdapter) {
  const router = new Hono()

  /**
   * POST /files/upload/intent
   * Request a presigned upload URL (S3) or a server-upload ticket (local).
   * Returns { fileId, uploadUrl, method, headers } or { fileId, uploadEndpoint }.
   */
  router.post('/upload/intent', requireAuth, zValidator('json', UploadIntentSchema), async (c) => {
    const userId = c.get('userId')
    const body   = c.req.valid('json')
    const caps   = storage.capabilities()

    const fileId = randomUUID()
    const path   = `files/${userId}/${fileId}`

    if (caps.supportsPresignedUpload) {
      const intent = await storage.getPresignedUploadUrl(path, body.sizeBytes, {
        mimeTypeHint: body.mimeTypeHint,
      })
      // Create a placeholder row so we can later associate metadata
      await db.insert(files).values({
        id:               fileId,
        ownerId:          userId,
        storageBackend:   process.env['STORAGE_BACKEND'] ?? 'local',
        storageReference: intent.reference,
        encryptedMetadata: Buffer.alloc(0), // placeholder until /upload/complete
        wrappedFek:        Buffer.alloc(0), // placeholder
        uploadCompleted:  false,
      })
      return c.json({ fileId, presigned: true, ...intent })
    }

    // Local backend: return a server-upload endpoint
    await db.insert(files).values({
      id:               fileId,
      ownerId:          userId,
      storageBackend:   'local',
      storageReference: path, // will be updated after actual upload
      encryptedMetadata: Buffer.alloc(0),
      wrappedFek:        Buffer.alloc(0),
      uploadCompleted:  false,
    })
    return c.json({ fileId, presigned: false, uploadEndpoint: `/api/v1/files/upload/${fileId}` })
  })

  /**
   * PUT /files/upload/:fileId
   * Server-proxied upload for local filesystem backend.
   * The encrypted blob is streamed to disk; the API never decrypts it.
   */
  router.put('/upload/:fileId', requireAuth, async (c) => {
    const userId = c.get('userId')
    const fileId = c.req.param('fileId')

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.ownerId, userId), isNull(files.deletedAt)))
      .limit(1)

    if (!file) throw new HTTPException(404, { message: 'File not found' })
    if (file.uploadCompleted) throw new HTTPException(409, { message: 'Already uploaded' })

    const contentLength = parseInt(c.req.header('content-length') ?? '0')
    const path = `files/${userId}/${fileId}`

    const info = await storage.put(path, c.req.raw.body as ReadableStream<Uint8Array>, contentLength)

    await db.update(files)
      .set({ storageReference: info.reference })
      .where(eq(files.id, fileId))

    return c.json({ ok: true, reference: info.reference })
  })

  /**
   * POST /files/upload/complete
   * Called after the client has finished uploading (presigned or proxied).
   * Stores encrypted metadata, wrapped FEKs, and marks the file as complete.
   */
  router.post('/upload/complete', requireAuth, zValidator('json', UploadCompleteSchema), async (c) => {
    const userId = c.get('userId')
    const body   = c.req.valid('json')

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, body.fileId), eq(files.ownerId, userId), isNull(files.deletedAt)))
      .limit(1)

    if (!file) throw new HTTPException(404, { message: 'File not found' })

    // For presigned uploads: verify the object actually exists in storage
    if (storage.capabilities().supportsPresignedUpload) {
      await storage.confirmUpload(file.storageReference)
    }

    await db.update(files)
      .set({
        encryptedMetadata:   Buffer.from(body.encryptedMetadata, 'base64url'),
        wrappedFek:          Buffer.from(body.wrappedFek, 'base64url'),
        thumbnailReference:  body.thumbnailReference,
        wrappedThumbnailFek: body.wrappedThumbnailFek ? Buffer.from(body.wrappedThumbnailFek, 'base64url') : null,
        blurhash:            body.blurhash,
        contentHash:         body.contentHash ? Buffer.from(body.contentHash, 'base64url') : null,
        uploadCompleted:     true,
      })
      .where(eq(files.id, body.fileId))

    return c.json({ ok: true, fileId: body.fileId })
  })

  /**
   * GET /files
   * List the authenticated user's files (paginated, newest first).
   * Returns encrypted metadata blobs and wrapped FEKs.
   * Client decrypts everything — the server returns opaque blobs.
   */
  router.get('/', requireAuth, async (c) => {
    const userId = c.get('userId')
    const limit  = Math.min(parseInt(c.req.query('limit') ?? '50'), 100)
    const cursor = c.req.query('cursor') // ISO timestamp for cursor pagination

    const rows = await db
      .select({
        id:                  files.id,
        storageBackend:      files.storageBackend,
        encryptedMetadata:   files.encryptedMetadata,
        wrappedFek:          files.wrappedFek,
        wrappedThumbnailFek: files.wrappedThumbnailFek,
        thumbnailReference:  files.thumbnailReference,
        blurhash:            files.blurhash,
        createdAt:           files.createdAt,
      })
      .from(files)
      .where(and(
        eq(files.ownerId, userId),
        eq(files.uploadCompleted, true),
        isNull(files.deletedAt),
        cursor ? desc(files.createdAt) : undefined,
      ))
      .orderBy(desc(files.createdAt))
      .limit(limit + 1) // fetch one extra to determine if there's a next page

    const hasMore = rows.length > limit
    const items   = hasMore ? rows.slice(0, limit) : rows

    return c.json({
      items: items.map(serializeFileRow),
      nextCursor: hasMore ? items.at(-1)?.createdAt.toISOString() : null,
    })
  })

  /**
   * GET /files/:fileId
   * Single file record. Returns encrypted metadata + wrapped FEK.
   */
  router.get('/:fileId', requireAuth, async (c) => {
    const userId = c.get('userId')
    const fileId = c.req.param('fileId')

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.ownerId, userId), isNull(files.deletedAt)))
      .limit(1)

    if (!file) throw new HTTPException(404, { message: 'File not found' })
    return c.json(serializeFileRow(file))
  })

  /**
   * GET /files/:fileId/download
   * Return a presigned download URL or stream the file (local backend).
   */
  router.get('/:fileId/download', requireAuth, async (c) => {
    const userId = c.get('userId')
    const fileId = c.req.param('fileId')

    const [file] = await db
      .select({ storageReference: files.storageReference, ownerId: files.ownerId })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.ownerId, userId), isNull(files.deletedAt)))
      .limit(1)

    if (!file) throw new HTTPException(404, { message: 'File not found' })

    const caps = storage.capabilities()
    if (caps.supportsPresignedDownload) {
      const url = await storage.getPresignedDownloadUrl(file.storageReference, 3600)
      return c.json({ url, expiresIn: 3600 })
    }

    // Stream through the server for local backend
    const stream = await storage.get(file.storageReference)
    return new Response(stream, {
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  })

  /**
   * GET /files/:fileId/thumbnail
   * Return a presigned download URL for the encrypted thumbnail blob,
   * or stream it through the server for the local backend.
   */
  router.get('/:fileId/thumbnail', requireAuth, async (c) => {
    const userId = c.get('userId')
    const fileId = c.req.param('fileId')

    const [file] = await db
      .select({ thumbnailReference: files.thumbnailReference, ownerId: files.ownerId })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.ownerId, userId), isNull(files.deletedAt)))
      .limit(1)

    if (!file) throw new HTTPException(404, { message: 'File not found' })
    if (!file.thumbnailReference) throw new HTTPException(404, { message: 'No thumbnail for this file' })

    const caps = storage.capabilities()
    if (caps.supportsPresignedDownload) {
      const url = await storage.getPresignedDownloadUrl(file.thumbnailReference, 3600)
      return c.json({ url, expiresIn: 3600 })
    }

    const stream = await storage.get(file.thumbnailReference)
    return new Response(stream, {
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  })

  /**
   * DELETE /files/:fileId
   * Soft-delete a file. The encrypted blob in storage is not deleted immediately
   * (a background job handles garbage collection of orphaned blobs).
   */
  router.delete('/:fileId', requireAuth, async (c) => {
    const userId = c.get('userId')
    const fileId = c.req.param('fileId')

    const result = await db
      .update(files)
      .set({ deletedAt: new Date() })
      .where(and(eq(files.id, fileId), eq(files.ownerId, userId), isNull(files.deletedAt)))

    if (!result.count) throw new HTTPException(404, { message: 'File not found' })
    return c.json({ ok: true })
  })

  return router
}

// ─── Serialisation helpers ────────────────────────────────────────────────────

function serializeFileRow(row: {
  id: string
  storageBackend: string
  encryptedMetadata: Buffer | Uint8Array | null
  wrappedFek: Buffer | Uint8Array | null
  wrappedThumbnailFek?: Buffer | Uint8Array | null
  thumbnailReference?: string | null
  blurhash?: string | null
  createdAt: Date
}) {
  return {
    id:                  row.id,
    storageBackend:      row.storageBackend,
    encryptedMetadata:   row.encryptedMetadata ? Buffer.from(row.encryptedMetadata).toString('base64url') : null,
    wrappedFek:          row.wrappedFek ? Buffer.from(row.wrappedFek).toString('base64url') : null,
    wrappedThumbnailFek: row.wrappedThumbnailFek ? Buffer.from(row.wrappedThumbnailFek).toString('base64url') : null,
    thumbnailReference:  row.thumbnailReference ?? null,
    blurhash:            row.blurhash ?? null,
    createdAt:           row.createdAt.toISOString(),
  }
}
