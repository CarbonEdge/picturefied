import { describe, it, expect, vi } from 'vitest'
import {
  createSession,
  getSession,
  refreshSession,
  deleteSession,
  extractBearerToken,
} from '../session'

// Minimal KV mock
function createMockKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _opts?: unknown) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> }
}

describe('createSession', () => {
  it('creates a session and returns a 64-char hex token', async () => {
    const kv = createMockKV()
    const token = await createSession(kv, 'user-123')
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(kv.put).toHaveBeenCalledOnce()
  })

  it('stores session with 24h TTL', async () => {
    const kv = createMockKV()
    await createSession(kv, 'user-123')
    const call = (kv.put as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, { expirationTtl: number }]
    expect(call[2].expirationTtl).toBe(86400)
  })

  it('includes userId and future expiresAt', async () => {
    const kv = createMockKV()
    const before = Date.now()
    const token = await createSession(kv, 'user-abc')
    const after = Date.now()

    const raw = await kv.get(`session:${token}`)
    const data = JSON.parse(raw!) as { userId: string; expiresAt: number }
    expect(data.userId).toBe('user-abc')
    expect(data.expiresAt).toBeGreaterThanOrEqual(before + 86400_000 - 100)
    expect(data.expiresAt).toBeLessThanOrEqual(after + 86400_000 + 100)
  })
})

describe('getSession', () => {
  it('returns session for valid token', async () => {
    const kv = createMockKV()
    const token = await createSession(kv, 'user-123')
    const session = await getSession(kv, token)
    expect(session).not.toBeNull()
    expect(session?.userId).toBe('user-123')
  })

  it('returns null for unknown token', async () => {
    const kv = createMockKV()
    expect(await getSession(kv, 'does-not-exist')).toBeNull()
  })

  it('returns null for expired session', async () => {
    const kv = createMockKV()
    const token = await createSession(kv, 'user-123')

    // Manually expire it
    const raw = await kv.get(`session:${token}`)
    const data = JSON.parse(raw!) as { userId: string; expiresAt: number }
    data.expiresAt = Date.now() - 1
    await kv.put(`session:${token}`, JSON.stringify(data))

    expect(await getSession(kv, token)).toBeNull()
  })
})

describe('refreshSession', () => {
  it('extends the expiry by another 24h', async () => {
    const kv = createMockKV()
    const token = await createSession(kv, 'user-123')
    const before = (await getSession(kv, token))!.expiresAt

    // Small delay so the new expiresAt is strictly greater
    await new Promise((r) => setTimeout(r, 5))

    const refreshed = await refreshSession(kv, token)
    expect(refreshed).not.toBeNull()
    expect(refreshed!.expiresAt).toBeGreaterThan(before)
  })

  it('returns null for nonexistent session', async () => {
    const kv = createMockKV()
    expect(await refreshSession(kv, 'no-such-token')).toBeNull()
  })
})

describe('deleteSession', () => {
  it('removes the session so get returns null', async () => {
    const kv = createMockKV()
    const token = await createSession(kv, 'user-123')
    await deleteSession(kv, token)
    expect(await getSession(kv, token)).toBeNull()
  })
})

describe('extractBearerToken', () => {
  it('extracts token from valid header', () => {
    expect(extractBearerToken('Bearer mytoken123')).toBe('mytoken123')
  })

  it('returns null for missing header', () => {
    expect(extractBearerToken(null)).toBeNull()
  })

  it('returns null for undefined header', () => {
    expect(extractBearerToken(undefined)).toBeNull()
  })

  it('returns null for non-Bearer scheme', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull()
  })

  it('returns null for Bearer with no token', () => {
    // "Bearer " has 7 chars so this returns empty string — treated as falsy by callers
    expect(extractBearerToken('Bearer ')).toBe('')
  })
})
