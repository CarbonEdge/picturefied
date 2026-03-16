/**
 * Album route tests — create, list, get with files, add/remove files, delete.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authHeader, TEST_USER_ID } from './helpers.js'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockDb = {
  select:   vi.fn().mockReturnThis(),
  from:     vi.fn().mockReturnThis(),
  where:    vi.fn().mockReturnThis(),
  limit:    vi.fn().mockResolvedValue([]),
  orderBy:  vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  insert:   vi.fn().mockReturnThis(),
  values:   vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
  onConflictDoNothing: vi.fn().mockResolvedValue({ count: 0 }),
  update:   vi.fn().mockReturnThis(),
  set:      vi.fn().mockReturnThis(),
  delete:   vi.fn().mockReturnThis(),
}

vi.mock('../db/client.js', () => ({ db: mockDb }))
vi.mock('../db/schema.js', () => ({ albums: {}, albumFiles: {}, files: {} }))
vi.mock('drizzle-orm', () => ({
  eq:    vi.fn(() => 'eq'),
  and:   vi.fn(() => 'and'),
  isNull: vi.fn(() => 'isNull'),
  asc:   vi.fn(() => 'asc'),
}))

const ALBUM_ID = '44444444-4444-4444-4444-444444444444'
const FILE_ID  = '55555555-5555-5555-5555-555555555555'

const ENCRYPTED_META = Buffer.alloc(64).toString('base64url')

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /albums', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('requires authentication', async () => {
    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request('/albums', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('requires encryptedMetadata', async () => {
    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request('/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('creates an album and returns its id', async () => {
    mockDb.returning.mockResolvedValueOnce([{ id: ALBUM_ID, createdAt: new Date() }])
    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request('/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ encryptedMetadata: ENCRYPTED_META }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { id: string }
    expect(body.id).toBe(ALBUM_ID)
  })
})

describe('GET /albums', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns an empty list when user has no albums', async () => {
    mockDb.where.mockResolvedValueOnce([])
    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request('/albums', {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it('serializes encryptedMetadata as base64url', async () => {
    mockDb.where.mockResolvedValueOnce([{
      id: ALBUM_ID,
      encryptedMetadata: Buffer.alloc(64, 0xaa),
      createdAt: new Date(),
    }])
    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request('/albums', {
      headers: { Authorization: await authHeader() },
    })
    const body = await res.json() as { items: Array<{ encryptedMetadata: string }> }
    expect(typeof body.items[0]!.encryptedMetadata).toBe('string')
    // Should not be raw Buffer bytes
    expect(body.items[0]!.encryptedMetadata).not.toContain('[object')
  })
})

describe('GET /albums/:albumId', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 404 for an album not owned by the user', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // album not found
    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request(`/albums/${ALBUM_ID}`, {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it('returns album with its files', async () => {
    mockDb.limit.mockResolvedValueOnce([{
      id: ALBUM_ID, encryptedMetadata: Buffer.alloc(64), createdAt: new Date(),
    }])
    // albumFiles join query
    mockDb.orderBy.mockResolvedValueOnce([
      { id: FILE_ID, encryptedMetadata: Buffer.alloc(64), wrappedFek: Buffer.alloc(48), wrappedThumbnailFek: null, thumbnailReference: null, blurhash: null, sortOrder: 0, createdAt: new Date() },
    ])

    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request(`/albums/${ALBUM_ID}`, {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; files: Array<{ id: string }> }
    expect(body.id).toBe(ALBUM_ID)
    expect(body.files).toHaveLength(1)
    expect(body.files[0]!.id).toBe(FILE_ID)
  })
})

describe('DELETE /albums/:albumId', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('requires authentication', async () => {
    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request(`/albums/${ALBUM_ID}`, { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('returns 404 when album is not found or not owned', async () => {
    mockDb.where.mockResolvedValueOnce({ count: 0 })
    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request(`/albums/${ALBUM_ID}`, {
      method: 'DELETE',
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })
})

describe('POST /albums/:albumId/files', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('only adds files owned by the requesting user', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: ALBUM_ID }])        // album found
    mockDb.where.mockResolvedValueOnce([{ id: FILE_ID }])         // owned files

    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request(`/albums/${ALBUM_ID}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ fileIds: [FILE_ID] }),
    })
    expect(res.status).toBe(200)
  })

  it('rejects an empty fileIds array', async () => {
    const { default: router } = await import('../routes/albums.js')
    const app = new Hono().route('/albums', router)
    const res = await app.request(`/albums/${ALBUM_ID}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ fileIds: [] }),
    })
    expect(res.status).toBe(400)
  })
})
