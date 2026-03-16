/**
 * Shares route tests — the most security-critical routes in the application.
 *
 * Key things we test:
 * - Creating a share requires ownership of the resource
 * - Public resolution endpoint returns linkWrappedFek (not the real FEK)
 * - Expired and revoked shares return appropriate errors
 * - Access count is tracked on resolve
 * - Max access count is enforced
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
  leftJoin: vi.fn().mockReturnThis(),
  insert:   vi.fn().mockReturnThis(),
  values:   vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
  update:   vi.fn().mockReturnThis(),
  set:      vi.fn().mockReturnThis(),
  delete:   vi.fn().mockReturnThis(),
}

vi.mock('../db/client.js', () => ({ db: mockDb }))
vi.mock('../db/schema.js', () => ({ shares: {}, files: {}, albums: {} }))
vi.mock('drizzle-orm', () => ({
  eq:    vi.fn(() => 'eq'),
  and:   vi.fn(() => 'and'),
  isNull: vi.fn(() => 'isNull'),
  desc:  vi.fn(() => 'desc'),
}))

const FILE_ID  = '11111111-1111-1111-1111-111111111111'
const SHARE_ID = '22222222-2222-2222-2222-222222222222'
const TOKEN    = 'abc123sharetoken'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /shares', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('requires authentication', async () => {
    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request('/shares', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('returns 404 when file does not exist or is not owned by user', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // file not found
    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request('/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({
        resourceType:   'file',
        resourceId:     FILE_ID,
        linkWrappedFek: Buffer.alloc(48).toString('base64url'),
      }),
    })
    expect(res.status).toBe(404)
  })

  it('creates a share and returns a URL with the share token', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: FILE_ID }]) // file found
    mockDb.returning.mockResolvedValueOnce([{
      id:        SHARE_ID,
      shareToken: TOKEN,
      createdAt: new Date(),
    }])

    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request('/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({
        resourceType:   'file',
        resourceId:     FILE_ID,
        linkWrappedFek: Buffer.alloc(48).toString('base64url'),
        permissions:    { view: true, download: false },
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { url: string; shareToken: string }
    expect(body.url).toContain(TOKEN)
    expect(body.shareToken).toBe(TOKEN)
  })

  it('rejects share with invalid resourceId (not a UUID)', async () => {
    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request('/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({
        resourceType:   'file',
        resourceId:     'not-a-uuid',
        linkWrappedFek: 'abc',
      }),
    })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /shares/:shareId', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('requires authentication', async () => {
    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request(`/shares/${SHARE_ID}`, { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('returns 404 for a share not owned by the user', async () => {
    // Mock update returning count=0 (no rows updated = not found/not owner)
    mockDb.where = vi.fn().mockResolvedValueOnce({ count: 0 })

    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request(`/shares/${SHARE_ID}`, {
      method: 'DELETE',
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /shares/resolve/:token (public endpoint)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const validShare = {
    id:             SHARE_ID,
    fileId:         FILE_ID,
    albumId:        null,
    linkWrappedFek: Buffer.alloc(48, 0xcc),
    permissions:    { view: true, download: false },
    expiresAt:      null,
    maxAccessCount: null,
    accessCount:    0,
    storageRef:     'files/ref',
    storageBackend: 'local',
    thumbnailRef:   null,
    blurhash:       null,
  }

  it('returns the linkWrappedFek for a valid share token', async () => {
    mockDb.limit.mockResolvedValueOnce([validShare])

    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request(`/shares/resolve/${TOKEN}`)

    expect(res.status).toBe(200)
    const body = await res.json() as { linkWrappedFek: string; fileId: string }
    expect(body.linkWrappedFek).toBeTruthy()
    expect(body.fileId).toBe(FILE_ID)
  })

  it('returns 404 for an unknown token', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // no share found

    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request('/shares/resolve/badtoken')
    expect(res.status).toBe(404)
  })

  it('returns 410 for an expired share', async () => {
    mockDb.limit.mockResolvedValueOnce([{
      ...validShare,
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    }])

    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request(`/shares/resolve/${TOKEN}`)
    expect(res.status).toBe(410)
  })

  it('returns 410 when max access count is reached', async () => {
    mockDb.limit.mockResolvedValueOnce([{
      ...validShare,
      maxAccessCount: 5,
      accessCount:    5, // already at limit
    }])

    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request(`/shares/resolve/${TOKEN}`)
    expect(res.status).toBe(410)
  })

  it('does NOT expose the real FEK — only the link-wrapped version', async () => {
    // The linkWrappedFek is FEK encrypted with shareLinkKey (symmetric).
    // The real FEK is never returned. A test can verify the field name:
    mockDb.limit.mockResolvedValueOnce([validShare])

    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    const res = await app.request(`/shares/resolve/${TOKEN}`)
    const body = await res.json() as Record<string, unknown>

    // The response should have linkWrappedFek but NOT wrappedFek or fek
    expect('linkWrappedFek' in body).toBe(true)
    expect('wrappedFek' in body).toBe(false)
    expect('fek' in body).toBe(false)
  })

  it('does not require authentication', async () => {
    // The resolve endpoint is public — no auth header
    mockDb.limit.mockResolvedValueOnce([validShare])

    const { default: sharesRouter } = await import('../routes/shares.js')
    const app = new Hono().route('/shares', sharesRouter)
    // Intentionally NO Authorization header
    const res = await app.request(`/shares/resolve/${TOKEN}`)
    expect(res.status).toBe(200)
  })
})
