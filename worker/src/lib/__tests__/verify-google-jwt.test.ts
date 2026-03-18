import { describe, it, expect, vi } from 'vitest'
import { verifyGoogleIdToken } from '../verify-google-jwt'
import type { JwkKey } from '../verify-google-jwt'

// Helpers

async function generateRsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function encodeObj(obj: object): string {
  return btoa(JSON.stringify(obj))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function signToken(
  keyPair: CryptoKeyPair,
  payload: object,
  kid = 'test-key-id',
): Promise<string> {
  const headerB64 = encodeObj({ alg: 'RS256', kid, typ: 'JWT' })
  const payloadB64 = encodeObj(payload)
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${base64url(signature)}`
}

async function exportJwk(publicKey: CryptoKey, kid = 'test-key-id'): Promise<JwkKey> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey)
  return { ...(jwk as JwkKey), kid, alg: 'RS256', use: 'sig' }
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

describe('verifyGoogleIdToken', () => {
  it('verifies a valid token', async () => {
    const kp = await generateRsaKeyPair()
    const jwk = await exportJwk(kp.publicKey)
    const mockFetchKeys = vi.fn<() => Promise<JwkKey[]>>().mockResolvedValue([jwk])

    const now = nowSeconds()
    const token = await signToken(kp, {
      iss: 'https://accounts.google.com',
      aud: 'test-client-id',
      sub: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      iat: now,
      exp: now + 3600,
    })

    const payload = await verifyGoogleIdToken(token, 'test-client-id', mockFetchKeys)
    expect(payload.sub).toBe('user-123')
    expect(payload.email).toBe('test@example.com')
    expect(mockFetchKeys).toHaveBeenCalledOnce()
  })

  it('rejects an expired token', async () => {
    const kp = await generateRsaKeyPair()
    const jwk = await exportJwk(kp.publicKey)
    const mockFetchKeys = vi.fn<() => Promise<JwkKey[]>>().mockResolvedValue([jwk])

    const now = nowSeconds()
    const token = await signToken(kp, {
      iss: 'https://accounts.google.com',
      aud: 'test-client-id',
      sub: 'user-123',
      email: 'test@example.com',
      iat: now - 7200,
      exp: now - 60, // expired
    })

    await expect(verifyGoogleIdToken(token, 'test-client-id', mockFetchKeys)).rejects.toThrow(
      'Token expired',
    )
  })

  it('rejects wrong audience', async () => {
    const kp = await generateRsaKeyPair()
    const jwk = await exportJwk(kp.publicKey)
    const mockFetchKeys = vi.fn<() => Promise<JwkKey[]>>().mockResolvedValue([jwk])

    const now = nowSeconds()
    const token = await signToken(kp, {
      iss: 'https://accounts.google.com',
      aud: 'correct-client-id',
      sub: 'user-123',
      email: 'test@example.com',
      iat: now,
      exp: now + 3600,
    })

    await expect(
      verifyGoogleIdToken(token, 'wrong-client-id', mockFetchKeys),
    ).rejects.toThrow('Invalid audience')
  })

  it('rejects invalid signature', async () => {
    const kp = await generateRsaKeyPair()
    const now = nowSeconds()
    const token = await signToken(kp, {
      iss: 'https://accounts.google.com',
      aud: 'test-client-id',
      sub: 'user-123',
      email: 'test@example.com',
      iat: now,
      exp: now + 3600,
    })

    // Use a different key for verification
    const wrongKp = await generateRsaKeyPair()
    const wrongJwk = await exportJwk(wrongKp.publicKey)
    const mockFetchKeys = vi.fn<() => Promise<JwkKey[]>>().mockResolvedValue([wrongJwk])

    await expect(verifyGoogleIdToken(token, 'test-client-id', mockFetchKeys)).rejects.toThrow(
      'Invalid JWT signature',
    )
  })

  it('rejects invalid issuer', async () => {
    const kp = await generateRsaKeyPair()
    const jwk = await exportJwk(kp.publicKey)
    const mockFetchKeys = vi.fn<() => Promise<JwkKey[]>>().mockResolvedValue([jwk])

    const now = nowSeconds()
    const token = await signToken(kp, {
      iss: 'https://evil.com', // wrong issuer
      aud: 'test-client-id',
      sub: 'user-123',
      email: 'test@example.com',
      iat: now,
      exp: now + 3600,
    })

    await expect(verifyGoogleIdToken(token, 'test-client-id', mockFetchKeys)).rejects.toThrow(
      'Invalid issuer',
    )
  })

  it('accepts accounts.google.com issuer (short form)', async () => {
    const kp = await generateRsaKeyPair()
    const jwk = await exportJwk(kp.publicKey)
    const mockFetchKeys = vi.fn<() => Promise<JwkKey[]>>().mockResolvedValue([jwk])

    const now = nowSeconds()
    const token = await signToken(kp, {
      iss: 'accounts.google.com', // short form is also valid
      aud: 'test-client-id',
      sub: 'user-123',
      email: 'test@example.com',
      iat: now,
      exp: now + 3600,
    })

    const payload = await verifyGoogleIdToken(token, 'test-client-id', mockFetchKeys)
    expect(payload.sub).toBe('user-123')
  })

  it('rejects malformed token (wrong number of parts)', async () => {
    const mockFetchKeys = vi.fn<() => Promise<JwkKey[]>>().mockResolvedValue([])
    await expect(
      verifyGoogleIdToken('not.enough', 'test-client-id', mockFetchKeys),
    ).rejects.toThrow('Invalid JWT format')
  })
})
