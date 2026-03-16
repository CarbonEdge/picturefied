/**
 * Typed API client.
 * All requests use fetch. Auth token is read from sessionStorage on each call
 * (short-lived access token; refresh handled transparently).
 */

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '/api/v1'

// ─── Token management ─────────────────────────────────────────────────────────

let accessToken: string | null = null
let refreshToken: string | null = null

export function setTokens(tokens: { accessToken: string; refreshToken: string }) {
  accessToken  = tokens.accessToken
  // Refresh token stored in sessionStorage — cleared when tab closes
  sessionStorage.setItem('picturefied_rt', tokens.refreshToken)
  refreshToken = tokens.refreshToken
}

export function loadStoredTokens() {
  refreshToken = sessionStorage.getItem('picturefied_rt')
}

export function clearTokens() {
  accessToken = null
  refreshToken = null
  sessionStorage.removeItem('picturefied_rt')
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }

  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })

  if (res.status === 401 && retry && refreshToken) {
    // Try to refresh the access token
    const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (refreshed.ok) {
      const tokens = await refreshed.json() as { accessToken: string; refreshToken: string }
      setTokens(tokens)
      return apiFetch(path, init, false) // retry once
    } else {
      clearTokens()
      window.location.href = '/login'
      throw new Error('Session expired')
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new ApiError(body.error ?? res.statusText, res.status)
  }

  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  getSalt: (handle: string) =>
    apiFetch<{ salt: string }>(`/auth/salt/${handle}`, { method: 'GET' }),

  register: (body: { handle: string; email?: string; password: string; argon2Salt: string }) =>
    apiFetch<{ accessToken: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { handle: string; password: string }) =>
    apiFetch<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  logout: () => {
    if (!refreshToken) return Promise.resolve()
    return apiFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).finally(clearTokens)
  },
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const keys = {
  getMyKeys: () =>
    apiFetch<{
      keys: {
        identity: { publicKey: string; encryptedPrivateKey: string; version: number }
        signing:  { publicKey: string; encryptedPrivateKey: string; version: number }
      } | null
    }>('/keys/me'),

  putMyKeys: (body: {
    identity: { publicKey: string; encryptedPrivateKey: string }
    signing:  { publicKey: string; encryptedPrivateKey: string }
  }) => apiFetch('/keys/me', { method: 'PUT', body: JSON.stringify(body) }),
}

// ─── Files ────────────────────────────────────────────────────────────────────

export interface ApiFile {
  id: string
  storageBackend: string
  encryptedMetadata: string  // base64url
  wrappedFek: string         // base64url
  wrappedThumbnailFek: string | null
  thumbnailReference: string | null
  blurhash: string | null
  createdAt: string
}

export const files = {
  uploadIntent: (body: { sizeBytes: number; mimeTypeHint?: string }) =>
    apiFetch<{ fileId: string; presigned: boolean; uploadUrl?: string; method?: string; headers?: Record<string, string>; uploadEndpoint?: string; reference: string }>(
      '/files/upload/intent',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  uploadComplete: (body: {
    fileId: string
    wrappedFek: string
    encryptedMetadata: string
    thumbnailReference?: string
    wrappedThumbnailFek?: string
    blurhash?: string
    contentHash?: string
  }) => apiFetch('/files/upload/complete', { method: 'POST', body: JSON.stringify(body) }),

  list: (cursor?: string) =>
    apiFetch<{ items: ApiFile[]; nextCursor: string | null }>(
      `/files${cursor ? `?cursor=${cursor}` : ''}`,
    ),

  getDownloadUrl: (fileId: string) =>
    apiFetch<{ url: string; expiresIn: number }>(`/files/${fileId}/download`),

  delete: (fileId: string) =>
    apiFetch(`/files/${fileId}`, { method: 'DELETE' }),
}

// ─── Albums ───────────────────────────────────────────────────────────────────

export const albums = {
  create: (body: { encryptedMetadata: string }) =>
    apiFetch<{ id: string; createdAt: string }>('/albums', { method: 'POST', body: JSON.stringify(body) }),

  list: () => apiFetch<{ items: { id: string; encryptedMetadata: string; createdAt: string }[] }>('/albums'),

  get: (albumId: string) =>
    apiFetch<{
      id: string
      encryptedMetadata: string
      createdAt: string
      files: ApiFile[]
    }>(`/albums/${albumId}`),

  addFiles: (albumId: string, fileIds: string[]) =>
    apiFetch(`/albums/${albumId}/files`, { method: 'POST', body: JSON.stringify({ fileIds }) }),

  removeFile: (albumId: string, fileId: string) =>
    apiFetch(`/albums/${albumId}/files/${fileId}`, { method: 'DELETE' }),
}

// ─── Shares ───────────────────────────────────────────────────────────────────

export const shares = {
  create: (body: {
    resourceType: 'file' | 'album'
    resourceId: string
    linkWrappedFek: string
    permissions?: { view: boolean; download: boolean }
    expiresAt?: string
    maxAccessCount?: number
  }) =>
    apiFetch<{ id: string; shareToken: string; url: string; createdAt: string }>(
      '/shares',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  list: () =>
    apiFetch<{ items: { id: string; fileId: string | null; albumId: string | null; url: string; permissions: unknown; accessCount: number; expiresAt: string | null; createdAt: string }[] }>('/shares'),

  revoke: (shareId: string) =>
    apiFetch(`/shares/${shareId}`, { method: 'DELETE' }),

  resolve: (token: string) =>
    fetch(`/s/${token}`).then((r) => {
      if (!r.ok) throw new ApiError('Share not found', r.status)
      return r.json() as Promise<{
        linkWrappedFek: string
        permissions: unknown
        fileId: string | null
        albumId: string | null
        blurhash: string | null
      }>
    }),
}
