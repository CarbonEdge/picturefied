/**
 * Auth route tests — register, login, refresh, logout.
 *
 * Strategy: mock the DB and argon2 so tests run fast with no side effects.
 * We test route logic and response shapes, not database internals.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { TEST_USER_ID, TEST_HANDLE } from './helpers.js'

// ─── Module mocks (must be hoisted before imports) ────────────────────────────

const mockDb = {
  select:   vi.fn().mockReturnThis(),
  from:     vi.fn().mockReturnThis(),
  where:    vi.fn().mockReturnThis(),
  limit:    vi.fn().mockResolvedValue([]),
  insert:   vi.fn().mockReturnThis(),
  values:   vi.fn().mockResolvedValue([]),
  update:   vi.fn().mockReturnThis(),
  set:      vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
}

vi.mock('../db/client.js',  () => ({ db: mockDb }))
vi.mock('../db/schema.js',  () => ({
  users:         {},
  userPasswords: {},
  userArgon2Salts: {},
  refreshTokens: {},
}))
vi.mock('argon2', () => ({
  hash:   vi.fn().mockResolvedValue('$argon2id$v=19$hashed'),
  verify: vi.fn().mockResolvedValue(true),
}))
// Drizzle operator functions
vi.mock('drizzle-orm', () => ({
  eq:    vi.fn((_a: unknown, _b: unknown) => 'eq-condition'),
  and:   vi.fn((...args: unknown[]) => args.join('-and-')),
  isNull: vi.fn((_a: unknown) => 'is-null'),
}))

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /auth/salt/:handle', () => {
  it('returns a salt for a known user', async () => {
    const saltBytes = Buffer.alloc(32, 0xab)
    mockDb.limit.mockResolvedValueOnce([{ id: TEST_USER_ID }])   // user found
    mockDb.limit.mockResolvedValueOnce([{ salt: saltBytes }])    // salt found

    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request(`/auth/salt/${TEST_HANDLE}`)

    expect(res.status).toBe(200)
    const body = await res.json() as { salt: string }
    expect(body.salt).toBeTruthy()
    expect(typeof body.salt).toBe('string')
  })

  it('returns a fake salt for an unknown user (prevents enumeration)', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // user not found

    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request(`/auth/salt/nobody`)

    // Still returns 200 with a salt — attacker can't tell if user exists
    expect(res.status).toBe(200)
    const body = await res.json() as { salt: string }
    expect(body.salt).toBeTruthy()
  })
})

describe('POST /auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no existing user
    mockDb.limit.mockResolvedValue([])
    mockDb.values.mockResolvedValue([])
    mockDb.returning.mockResolvedValue([{ id: TEST_USER_ID }])
  })

  it('rejects a handle that is too short', async () => {
    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'a', password: 'password12345', argon2Salt: 'abc' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a handle with special characters', async () => {
    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'bad handle!', password: 'password12345', argon2Salt: 'abc' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a password shorter than 12 characters', async () => {
    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'validhandle', password: 'short', argon2Salt: 'abc' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 409 when handle is already taken', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'existing-user-id' }]) // user found
    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'taken', password: 'password12345', argon2Salt: Buffer.alloc(32).toString('base64url') }),
    })
    expect(res.status).toBe(409)
  })
})

describe('POST /auth/login', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 for unknown handle', async () => {
    const { verify } = await import('argon2')
    vi.mocked(verify).mockResolvedValueOnce(false)
    mockDb.limit.mockResolvedValueOnce([]) // user not found

    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'nobody', password: 'any-password' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 for wrong password', async () => {
    const { verify } = await import('argon2')
    vi.mocked(verify).mockResolvedValueOnce(false) // wrong password
    mockDb.limit.mockResolvedValueOnce([{
      id: TEST_USER_ID,
      handle: TEST_HANDLE,
      passwordHash: '$argon2id$hashed',
    }])

    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: TEST_HANDLE, password: 'wrong-password' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns tokens for valid credentials', async () => {
    const { verify } = await import('argon2')
    vi.mocked(verify).mockResolvedValueOnce(true)
    mockDb.limit.mockResolvedValueOnce([{
      id: TEST_USER_ID,
      handle: TEST_HANDLE,
      passwordHash: '$argon2id$hashed',
    }])
    mockDb.returning.mockResolvedValueOnce([]) // insert refresh token

    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: TEST_HANDLE, password: 'correct-password' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { accessToken?: string; refreshToken?: string }
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
  })
})

describe('POST /auth/logout', () => {
  it('returns 200 ok', async () => {
    mockDb.update = vi.fn().mockReturnThis()
    mockDb.set    = vi.fn().mockReturnThis()
    mockDb.where  = vi.fn().mockResolvedValue({ count: 1 })

    const { default: authRouter } = await import('../routes/auth.js')
    const app = new Hono().route('/auth', authRouter)
    const res = await app.request('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'any-token' }),
    })
    expect(res.status).toBe(200)
  })
})
