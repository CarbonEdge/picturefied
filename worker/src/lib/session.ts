/**
 * Session management using Cloudflare KV.
 * Sessions are stored as JSON with a 24h TTL.
 */

export interface SessionData {
  userId: string
  expiresAt: number
}

const SESSION_TTL_SECONDS = 24 * 60 * 60 // 24h

export function generateSessionToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function createSession(kv: KVNamespace, userId: string): Promise<string> {
  const token = generateSessionToken()
  const data: SessionData = {
    userId,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  }
  await kv.put(`session:${token}`, JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SECONDS,
  })
  return token
}

export async function getSession(
  kv: KVNamespace,
  token: string,
): Promise<SessionData | null> {
  const raw = await kv.get(`session:${token}`)
  if (!raw) return null
  const data = JSON.parse(raw) as SessionData
  if (data.expiresAt < Date.now()) return null
  return data
}

export async function refreshSession(
  kv: KVNamespace,
  token: string,
): Promise<SessionData | null> {
  const data = await getSession(kv, token)
  if (!data) return null
  const updated: SessionData = {
    ...data,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  }
  await kv.put(`session:${token}`, JSON.stringify(updated), {
    expirationTtl: SESSION_TTL_SECONDS,
  })
  return updated
}

export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(`session:${token}`)
}

/** Extract session token from Authorization: Bearer <token> header. */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}
