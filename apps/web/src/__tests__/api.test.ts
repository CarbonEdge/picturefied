/**
 * API client tests — token management, automatic refresh, error handling.
 *
 * We mock fetch globally to control what the "server" returns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { auth, files, shares, setTokens, clearTokens, ApiError } from '../lib/api.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let callIndex = 0
  return vi.fn().mockImplementation(() => {
    const response = responses[callIndex++] ?? { status: 500, body: { error: 'No more mocked responses' } }
    return Promise.resolve({
      ok:     response.status >= 200 && response.status < 300,
      status: response.status,
      json:   () => Promise.resolve(response.body),
    })
  })
}

beforeEach(() => {
  clearTokens()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── auth.getSalt ─────────────────────────────────────────────────────────────

describe('auth.getSalt', () => {
  it('fetches the salt for a given handle', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 200, body: { salt: 'abc123' } }]))
    const result = await auth.getSalt('alice')
    expect(result.salt).toBe('abc123')
  })

  it('throws ApiError on non-200 response', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 404, body: { error: 'Not found' } }]))
    await expect(auth.getSalt('nobody')).rejects.toBeInstanceOf(ApiError)
  })
})

// ─── auth.register ────────────────────────────────────────────────────────────

describe('auth.register', () => {
  it('returns access and refresh tokens on success', async () => {
    vi.stubGlobal('fetch', mockFetch([{
      status: 201,
      body: { accessToken: 'access.token.here', refreshToken: 'refresh-token' },
    }]))
    const result = await auth.register({
      handle: 'alice', password: 'password12345', argon2Salt: 'salt123',
    })
    expect(result.accessToken).toBe('access.token.here')
    expect(result.refreshToken).toBe('refresh-token')
  })

  it('throws ApiError on 409 conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 409, body: { error: 'Handle already taken' } }]))
    await expect(
      auth.register({ handle: 'taken', password: 'password12345', argon2Salt: 'salt' }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('ApiError carries the correct status code', async () => {
    vi.stubGlobal('fetch', mockFetch([{ status: 409, body: { error: 'Handle already taken' } }]))
    try {
      await auth.register({ handle: 'taken', password: 'pw12345678', argon2Salt: 'salt' })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(409)
    }
  })
})

// ─── Token management ─────────────────────────────────────────────────────────

describe('setTokens / clearTokens', () => {
  it('setTokens stores the refresh token in sessionStorage', () => {
    setTokens({ accessToken: 'at', refreshToken: 'rt' })
    expect(sessionStorage.getItem('picturefied_rt')).toBe('rt')
  })

  it('clearTokens removes the refresh token from sessionStorage', () => {
    setTokens({ accessToken: 'at', refreshToken: 'rt' })
    clearTokens()
    expect(sessionStorage.getItem('picturefied_rt')).toBeNull()
  })
})

// ─── Automatic token refresh ──────────────────────────────────────────────────

describe('automatic token refresh', () => {
  it('retries with a new token after a 401 response', async () => {
    setTokens({ accessToken: 'expired-access', refreshToken: 'valid-refresh' })

    vi.stubGlobal('fetch', mockFetch([
      { status: 401, body: { error: 'Expired' } },                          // first call: 401
      { status: 200, body: { accessToken: 'new-access', refreshToken: 'new-refresh' } }, // refresh call
      { status: 200, body: { items: [], nextCursor: null } },                // retry with new token
    ]))

    const result = await files.list()
    expect(result.items).toEqual([])
  })
})

// ─── shares.resolve ───────────────────────────────────────────────────────────

describe('shares.resolve', () => {
  it('parses the share response correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        linkWrappedFek: 'wrapped-fek-base64',
        permissions: { view: true, download: false },
        fileId: 'file-uuid',
        albumId: null,
        blurhash: null,
      }),
    }))
    const result = await shares.resolve('abc123token')
    expect(result.linkWrappedFek).toBe('wrapped-fek-base64')
    expect(result.fileId).toBe('file-uuid')
  })

  it('throws ApiError for a 404 share', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404,
    }))
    await expect(shares.resolve('badtoken')).rejects.toBeInstanceOf(ApiError)
  })
})
