import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveSession,
  getSessionToken,
  getStoredUser,
  updateStoredUser,
  clearSession,
  isAuthenticated,
  exchangeGoogleToken,
  refreshSession,
} from '../lib/session'
import type { StoredUser } from '../lib/session'

const mockUser: StoredUser = {
  id: 'user-123',
  username: 'testuser',
  displayName: 'Test User',
  avatarUrl: null,
  bio: null,
  accountType: 'human',
  driveFolderId: null,
  createdAt: 1000000,
}

describe('saveSession / getSessionToken / getStoredUser', () => {
  beforeEach(() => localStorage.clear())

  it('saves and retrieves session token', () => {
    saveSession('tok-abc', mockUser)
    expect(getSessionToken()).toBe('tok-abc')
  })

  it('saves and retrieves user', () => {
    saveSession('tok-abc', mockUser)
    expect(getStoredUser()).toEqual(mockUser)
  })

  it('getStoredUser returns null when nothing stored', () => {
    expect(getStoredUser()).toBeNull()
  })

  it('getStoredUser returns null for malformed JSON', () => {
    localStorage.setItem('pf_user', 'not-json')
    expect(getStoredUser()).toBeNull()
  })
})

describe('updateStoredUser', () => {
  beforeEach(() => localStorage.clear())

  it('merges partial update', () => {
    saveSession('tok', mockUser)
    updateStoredUser({ bio: 'Hello world' })
    expect(getStoredUser()?.bio).toBe('Hello world')
    expect(getStoredUser()?.username).toBe('testuser')
  })

  it('does nothing when no session', () => {
    updateStoredUser({ bio: 'ignored' })
    expect(getStoredUser()).toBeNull()
  })
})

describe('clearSession', () => {
  beforeEach(() => localStorage.clear())

  it('removes token and user', () => {
    saveSession('tok', mockUser)
    clearSession()
    expect(getSessionToken()).toBeNull()
    expect(getStoredUser()).toBeNull()
  })
})

describe('isAuthenticated', () => {
  beforeEach(() => localStorage.clear())

  it('returns false when no session', () => {
    expect(isAuthenticated()).toBe(false)
  })

  it('returns true when session exists', () => {
    saveSession('tok', mockUser)
    expect(isAuthenticated()).toBe(true)
  })
})

describe('exchangeGoogleToken', () => {
  beforeEach(() => localStorage.clear())

  it('calls POST /auth/google and returns result', async () => {
    const mockResult = { sessionToken: 'new-tok', user: mockUser, isNewUser: false }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    })

    const result = await exchangeGoogleToken('google-cred', 'http://localhost:8787')

    expect(fetch).toHaveBeenCalledWith('http://localhost:8787/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: 'google-cred' }),
    })
    expect(result).toEqual(mockResult)
  })

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid Google token' }),
    })

    await expect(exchangeGoogleToken('bad', 'http://localhost:8787')).rejects.toThrow(
      'Invalid Google token',
    )
  })
})

describe('refreshSession', () => {
  it('returns true on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    expect(await refreshSession('my-token', 'http://localhost:8787')).toBe(true)
  })

  it('returns false on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    expect(await refreshSession('bad-token', 'http://localhost:8787')).toBe(false)
  })
})
