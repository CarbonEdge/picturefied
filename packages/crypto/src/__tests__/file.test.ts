import { describe, it, expect, beforeAll } from 'vitest'
import {
  getSodium,
  generateFek,
  encryptBytes,
  decryptBytes,
  wrapFek,
  unwrapFek,
  generateShareLinkKey,
  wrapFekForLink,
  unwrapFekFromLink,
  encryptMetadata,
  decryptMetadata,
  contentHash,
  generateUserKeys,
} from '../index.js'
import type { FileMetadata } from '../index.js'

beforeAll(async () => { await getSodium() })

// ─── FEK generation ───────────────────────────────────────────────────────────

describe('generateFek', () => {
  it('returns a 32-byte key', async () => {
    const fek = await generateFek()
    expect(fek.length).toBe(32)
  })

  it('generates unique keys on each call', async () => {
    const a = await generateFek()
    const b = await generateFek()
    expect(a).not.toEqual(b)
  })
})

// ─── Symmetric encrypt / decrypt ─────────────────────────────────────────────

describe('encryptBytes / decryptBytes', () => {
  it('round-trips arbitrary plaintext', async () => {
    const fek       = await generateFek()
    const plaintext = new TextEncoder().encode('hello picturefied')
    const encrypted = await encryptBytes(plaintext, fek)
    const decrypted = await decryptBytes(encrypted, fek)
    expect(decrypted).toEqual(plaintext)
  })

  it('round-trips an empty buffer', async () => {
    const fek       = await generateFek()
    const plaintext = new Uint8Array(0)
    const encrypted = await encryptBytes(plaintext, fek)
    const decrypted = await decryptBytes(encrypted, fek)
    expect(decrypted).toEqual(plaintext)
  })

  it('round-trips binary data (simulated image bytes)', async () => {
    const fek       = await generateFek()
    const image     = new Uint8Array(1024).map((_, i) => i % 256)
    const encrypted = await encryptBytes(image, fek)
    const decrypted = await decryptBytes(encrypted, fek)
    expect(decrypted).toEqual(image)
  })

  it('ciphertext is longer than plaintext (nonce + tag overhead)', async () => {
    const fek       = await generateFek()
    const plaintext = new Uint8Array(100)
    const encrypted = await encryptBytes(plaintext, fek)
    expect(encrypted.length).toBeGreaterThan(plaintext.length)
  })

  it('produces different ciphertext for the same plaintext (random nonce)', async () => {
    const fek       = await generateFek()
    const plaintext = new TextEncoder().encode('same data')
    const a = await encryptBytes(plaintext, fek)
    const b = await encryptBytes(plaintext, fek)
    expect(a).not.toEqual(b)
  })

  it('throws when decrypting with the wrong key', async () => {
    const fek1      = await generateFek()
    const fek2      = await generateFek()
    const plaintext = new TextEncoder().encode('secret')
    const encrypted = await encryptBytes(plaintext, fek1)
    await expect(decryptBytes(encrypted, fek2)).rejects.toThrow()
  })

  it('throws when ciphertext is tampered with', async () => {
    const fek       = await generateFek()
    const plaintext = new TextEncoder().encode('tamper me')
    const encrypted = await encryptBytes(plaintext, fek)
    // Flip a byte in the ciphertext (after the nonce)
    encrypted[30] ^= 0xff
    await expect(decryptBytes(encrypted, fek)).rejects.toThrow()
  })
})

// ─── FEK wrapping (asymmetric) ────────────────────────────────────────────────

describe('wrapFek / unwrapFek', () => {
  it('round-trips a FEK through asymmetric boxing', async () => {
    const keys   = await generateUserKeys()
    const fek    = await generateFek()
    const wrapped = await wrapFek(fek, keys.identity.publicKey)
    const unwrapped = await unwrapFek(wrapped, keys.identity.publicKey, keys.identity.privateKey)
    expect(unwrapped).toEqual(fek)
  })

  it('wrapped key is longer than the raw FEK', async () => {
    const keys    = await generateUserKeys()
    const fek     = await generateFek()
    const wrapped = await wrapFek(fek, keys.identity.publicKey)
    expect(wrapped.length).toBeGreaterThan(fek.length)
  })

  it('throws when unwrapping with the wrong private key', async () => {
    const alice = await generateUserKeys()
    const bob   = await generateUserKeys()
    const fek   = await generateFek()
    const wrapped = await wrapFek(fek, alice.identity.publicKey)
    await expect(unwrapFek(wrapped, bob.identity.publicKey, bob.identity.privateKey)).rejects.toThrow()
  })

  it('two wrappings of the same FEK produce different ciphertext (ephemeral ECDH)', async () => {
    const keys   = await generateUserKeys()
    const fek    = await generateFek()
    const a = await wrapFek(fek, keys.identity.publicKey)
    const b = await wrapFek(fek, keys.identity.publicKey)
    expect(a).not.toEqual(b)
  })
})

// ─── FEK wrapping (symmetric / link share) ───────────────────────────────────

describe('generateShareLinkKey / wrapFekForLink / unwrapFekFromLink', () => {
  it('generates a 32-byte share link key', async () => {
    const key = await generateShareLinkKey()
    expect(key.length).toBe(32)
  })

  it('generates unique keys on each call', async () => {
    const a = await generateShareLinkKey()
    const b = await generateShareLinkKey()
    expect(a).not.toEqual(b)
  })

  it('round-trips a FEK through link share wrapping', async () => {
    const fek          = await generateFek()
    const shareLinkKey = await generateShareLinkKey()
    const wrapped      = await wrapFekForLink(fek, shareLinkKey)
    const unwrapped    = await unwrapFekFromLink(wrapped, shareLinkKey)
    expect(unwrapped).toEqual(fek)
  })

  it('throws when unwrapping with the wrong share link key', async () => {
    const fek      = await generateFek()
    const keyA     = await generateShareLinkKey()
    const keyB     = await generateShareLinkKey()
    const wrapped  = await wrapFekForLink(fek, keyA)
    await expect(unwrapFekFromLink(wrapped, keyB)).rejects.toThrow()
  })
})

// ─── Metadata encryption ─────────────────────────────────────────────────────

describe('encryptMetadata / decryptMetadata', () => {
  const sampleMeta: FileMetadata = {
    filename:     'vacation.jpg',
    mimeTypeHint: 'image/jpeg',
    sizeBytes:    1_048_576,
    takenAt:      '2026-03-16T12:00:00.000Z',
    tags:         ['travel', 'beach'],
    description:  'Summer trip',
  }

  it('round-trips metadata correctly', async () => {
    const fek      = await generateFek()
    const encrypted = await encryptMetadata(sampleMeta, fek)
    const decrypted = await decryptMetadata(encrypted, fek)
    expect(decrypted).toEqual(sampleMeta)
  })

  it('metadata with no optional fields round-trips', async () => {
    const fek  = await generateFek()
    const meta: FileMetadata = {
      filename: 'photo.png', mimeTypeHint: 'image/png', sizeBytes: 512, takenAt: new Date().toISOString(), tags: [],
    }
    const decrypted = await decryptMetadata(await encryptMetadata(meta, fek), fek)
    expect(decrypted.filename).toBe('photo.png')
    expect(decrypted.tags).toEqual([])
    expect(decrypted.description).toBeUndefined()
  })

  it('throws when decrypting metadata with the wrong FEK', async () => {
    const fek1 = await generateFek()
    const fek2 = await generateFek()
    const encrypted = await encryptMetadata(sampleMeta, fek1)
    await expect(decryptMetadata(encrypted, fek2)).rejects.toThrow()
  })
})

// ─── Content hash ─────────────────────────────────────────────────────────────

describe('contentHash', () => {
  it('returns a 32-byte BLAKE2b hash', async () => {
    const hash = await contentHash(new TextEncoder().encode('test'))
    expect(hash.length).toBe(32)
  })

  it('is deterministic', async () => {
    const data = new TextEncoder().encode('deterministic')
    const a = await contentHash(data)
    const b = await contentHash(data)
    expect(a).toEqual(b)
  })

  it('produces different hashes for different data', async () => {
    const a = await contentHash(new TextEncoder().encode('file-a'))
    const b = await contentHash(new TextEncoder().encode('file-b'))
    expect(a).not.toEqual(b)
  })
})
