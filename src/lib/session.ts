/**
 * Client-side session management.
 *
 * Stores session token in localStorage.
 * Keys (crypto material) are NEVER stored here — they live in Zustand memory only.
 */

const SESSION_KEY = 'pf_session'
const USER_KEY = 'pf_user'

export interface StoredUser {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  accountType: string
  driveFolderId: string | null
  createdAt: number
}

export interface AuthResult {
  sessionToken: string
  user: StoredUser
  isNewUser: boolean
}

export function saveSession(token: string, user: StoredUser): void {
  localStorage.setItem(SESSION_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredUser
  } catch {
    return null
  }
}

export function updateStoredUser(updates: Partial<StoredUser>): void {
  const current = getStoredUser()
  if (!current) return
  localStorage.setItem(USER_KEY, JSON.stringify({ ...current, ...updates }))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isAuthenticated(): boolean {
  return getSessionToken() !== null
}

/** Exchange a Google ID token for a session token from the Worker. */
export async function exchangeGoogleToken(
  credential: string,
  apiUrl: string,
): Promise<AuthResult> {
  const response = await fetch(`${apiUrl}/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential }),
  })

  if (!response.ok) {
    const err = (await response.json().catch(() => ({ error: 'Unknown error' }))) as {
      error: string
    }
    throw new Error(err.error ?? 'Failed to authenticate')
  }

  return response.json() as Promise<AuthResult>
}

/** Refresh session with the Worker (sliding window). */
export async function refreshSession(token: string, apiUrl: string): Promise<boolean> {
  const response = await fetch(`${apiUrl}/auth/refresh`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  return response.ok
}
