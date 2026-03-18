/**
 * Verify a Google ID token (RS256 JWT) using the Web Crypto API.
 *
 * Google's JWKS endpoint: https://www.googleapis.com/oauth2/v3/certs
 */

export interface GoogleTokenPayload {
  sub: string
  email: string
  name?: string
  picture?: string
  email_verified?: boolean
  iat: number
  exp: number
  aud: string
  iss: string
}

export interface JwkKey {
  kty: string
  n: string
  e: string
  kid: string
  alg: string
  use: string
}

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const VALID_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

function base64urlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (padded.length % 4)) % 4)
  const base64 = padded + padding
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function base64urlDecodeText(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (padded.length % 4)) % 4)
  return atob(padded + padding)
}

function parseJwtParts(token: string): {
  header: Record<string, string>
  payload: GoogleTokenPayload
  signatureBuffer: ArrayBuffer
  signingInput: string
} {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  const header = JSON.parse(base64urlDecodeText(headerB64)) as Record<string, string>
  const payload = JSON.parse(base64urlDecodeText(payloadB64)) as GoogleTokenPayload
  const signatureBuffer = base64urlDecode(signatureB64)
  const signingInput = `${headerB64}.${payloadB64}`

  return { header, payload, signatureBuffer, signingInput }
}

async function importRsaKey(jwk: JwkKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
}

let jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null
const JWKS_CACHE_TTL = 60 * 60 * 1000 // 1 hour

async function fetchGoogleJwks(): Promise<JwkKey[]> {
  const now = Date.now()
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys
  }

  const response = await fetch(GOOGLE_JWKS_URL)
  if (!response.ok) throw new Error('Failed to fetch Google JWKS')

  const data = (await response.json()) as { keys: JwkKey[] }
  jwksCache = { keys: data.keys, fetchedAt: now }
  return data.keys
}

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  fetchKeys: () => Promise<JwkKey[]> = fetchGoogleJwks,
): Promise<GoogleTokenPayload> {
  const { header, payload, signatureBuffer, signingInput } = parseJwtParts(token)

  // Validate claims
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp < now) throw new Error('Token expired')
  if (!VALID_ISSUERS.includes(payload.iss)) throw new Error('Invalid issuer')
  if (payload.aud !== clientId) throw new Error('Invalid audience')

  // Find matching key by kid
  const keys = await fetchKeys()
  const kid = header['kid']
  const jwk = kid ? keys.find((k) => k.kid === kid) : keys[0]
  if (!jwk) throw new Error('No matching JWKS key found')

  // Verify signature
  const cryptoKey = await importRsaKey(jwk)
  const encoder = new TextEncoder()
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBuffer,
    encoder.encode(signingInput),
  )

  if (!valid) throw new Error('Invalid JWT signature')

  return payload
}
