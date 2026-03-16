/**
 * File routes tests — upload intent, complete, list, download, delete.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authHeader, TEST_USER_ID } from './helpers.js'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockDb = {
  select:  vi.fn().mockReturnThis(),
  from:    vi.fn().mockReturnThis(),
  where:   vi.fn().mockReturnThis(),
  limit:   vi.fn().mockResolvedValue([]),
  orderBy: vi.fn().mockReturnThis(),
  insert:  vi.fn().mockReturnThis(),
  values:  vi.fn().mockResolvedValue([]),
  returning: vi.fn().mockResolvedValue([]),
  update:  vi.fn().mockReturnThis(),
  set:     vi.fn().mockReturnThis(),
}

const mockStorageCapabilities = {
  supportsPresignedUpload:   false,
  supportsPresignedDownload: false,
  supportsRangeDownload:     true,
  maxFileSizeBytes:          null,
}

const mockStorage = {
  healthCheck:           vi.fn().mockResolvedValue({ ok: true }),
  put:                   vi.fn().mockResolvedValue({ reference: 'local/ref', path: '/test', sizeBytes: 100, createdAt: new Date(), modifiedAt: new Date() }),
  getPresignedUploadUrl: vi.fn().mockResolvedValue({ uploadUrl: 'https://s3/presigned', method: 'PUT', headers: {}, expiresAt: new Date(), reference: 's3/ref' }),
  confirmUpload:         vi.fn().mockResolvedValue({ reference: 's3/ref', path: '/test', sizeBytes: 100, createdAt: new Date(), modifiedAt: new Date() }),
  get:                   vi.fn().mockResolvedValue(new ReadableStream()),
  getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://s3/download'),
  stat:                  vi.fn(),
  delete:                vi.fn().mockResolvedValue(undefined),
  capabilities:          vi.fn().mockReturnValue(mockStorageCapabilities),
}

vi.mock('../db/client.js', () => ({ db: mockDb }))
vi.mock('../db/schema.js', () => ({ files: {} }))
vi.mock('drizzle-orm', () => ({
  eq:    vi.fn(() => 'eq'),
  and:   vi.fn(() => 'and'),
  isNull: vi.fn(() => 'isNull'),
  desc:  vi.fn(() => 'desc'),
}))

const FILE_ID = '33333333-3333-3333-3333-333333333333'

function makeFilesApp() {
  return import('../routes/files.js').then(({ createFilesRouter }) => {
    return new Hono().route('/files', createFilesRouter(mockStorage as never))
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /files/upload/intent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('requires authentication', async () => {
    const app = await makeFilesApp()
    const res = await app.request('/files/upload/intent', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('rejects sizeBytes of 0', async () => {
    const app = await makeFilesApp()
    const res = await app.request('/files/upload/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ sizeBytes: 0 }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects negative sizeBytes', async () => {
    const app = await makeFilesApp()
    const res = await app.request('/files/upload/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ sizeBytes: -1 }),
    })
    expect(res.status).toBe(400)
  })

  it('returns a server upload endpoint for local backend', async () => {
    mockStorage.capabilities.mockReturnValueOnce({ ...mockStorageCapabilities, supportsPresignedUpload: false })
    mockDb.values.mockResolvedValueOnce([])

    const app = await makeFilesApp()
    const res = await app.request('/files/upload/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ sizeBytes: 1024 }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { presigned: boolean; fileId: string; uploadEndpoint: string }
    expect(body.presigned).toBe(false)
    expect(body.fileId).toBeTruthy()
    expect(body.uploadEndpoint).toContain('/upload/')
  })

  it('returns a presigned URL for S3 backend', async () => {
    mockStorage.capabilities.mockReturnValueOnce({ ...mockStorageCapabilities, supportsPresignedUpload: true })
    mockDb.values.mockResolvedValueOnce([])

    const app = await makeFilesApp()
    const res = await app.request('/files/upload/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ sizeBytes: 1024 }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { presigned: boolean; uploadUrl: string }
    expect(body.presigned).toBe(true)
    expect(body.uploadUrl).toBeTruthy()
  })
})

describe('POST /files/upload/complete', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('requires authentication', async () => {
    const app = await makeFilesApp()
    const res = await app.request('/files/upload/complete', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('returns 404 when fileId does not belong to user', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // file not found

    const app = await makeFilesApp()
    const res = await app.request('/files/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({
        fileId:            FILE_ID,
        wrappedFek:        Buffer.alloc(48).toString('base64url'),
        encryptedMetadata: Buffer.alloc(64).toString('base64url'),
      }),
    })
    expect(res.status).toBe(404)
  })

  it('marks file as upload_completed=true on success', async () => {
    mockDb.limit.mockResolvedValueOnce([{
      id: FILE_ID, ownerId: TEST_USER_ID, storageReference: 'local/ref', uploadCompleted: false,
    }])
    mockDb.where.mockResolvedValueOnce({ count: 1 }) // update result

    const app = await makeFilesApp()
    const res = await app.request('/files/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({
        fileId:            FILE_ID,
        wrappedFek:        Buffer.alloc(48).toString('base64url'),
        encryptedMetadata: Buffer.alloc(64).toString('base64url'),
        blurhash:          'LKO2:N%2Tw=w]~RBVZRi};RPxuwH',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; fileId: string }
    expect(body.ok).toBe(true)
    expect(body.fileId).toBe(FILE_ID)
  })
})

describe('GET /files', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('requires authentication', async () => {
    const app = await makeFilesApp()
    const res = await app.request('/files')
    expect(res.status).toBe(401)
  })

  it('returns an empty list when user has no files', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // no files

    const app = await makeFilesApp()
    const res = await app.request('/files', {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { items: unknown[]; nextCursor: null }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
  })

  it('returns serialized file records', async () => {
    const fakeFile = {
      id:                  FILE_ID,
      storageBackend:      'local',
      encryptedMetadata:   Buffer.alloc(64),
      wrappedFek:          Buffer.alloc(48),
      wrappedThumbnailFek: null,
      thumbnailReference:  null,
      blurhash:            'LKO2:N%2Tw=w]~RBVZRi};RPxuwH',
      createdAt:           new Date('2026-03-16T00:00:00Z'),
    }
    mockDb.limit.mockResolvedValueOnce([fakeFile])

    const app = await makeFilesApp()
    const res = await app.request('/files', {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { items: Array<{ id: string; blurhash: string; encryptedMetadata: string }> }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.id).toBe(FILE_ID)
    // encryptedMetadata should be base64url encoded, not raw bytes
    expect(typeof body.items[0]!.encryptedMetadata).toBe('string')
    expect(body.items[0]!.blurhash).toBe('LKO2:N%2Tw=w]~RBVZRi};RPxuwH')
  })
})

describe('DELETE /files/:fileId', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('requires authentication', async () => {
    const app = await makeFilesApp()
    const res = await app.request(`/files/${FILE_ID}`, { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('returns 404 when file is not found or not owned', async () => {
    mockDb.where.mockResolvedValueOnce({ count: 0 })

    const app = await makeFilesApp()
    const res = await app.request(`/files/${FILE_ID}`, {
      method: 'DELETE',
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it('soft-deletes (does not call storage.delete)', async () => {
    mockDb.where.mockResolvedValueOnce({ count: 1 })

    const app = await makeFilesApp()
    await app.request(`/files/${FILE_ID}`, {
      method: 'DELETE',
      headers: { Authorization: await authHeader() },
    })
    // Storage delete should NOT be called — only DB soft-delete
    expect(mockStorage.delete).not.toHaveBeenCalled()
  })
})
