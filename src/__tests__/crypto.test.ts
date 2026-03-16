/**
 * Crypto library tests.
 *
 * Uses the mocked sodium from setup.ts — validates the higher-level
 * contract (determinism, key isolation, encrypt/decrypt round-trips)
 * without needing real WASM in test environments.
 */
import { describe, it, expect } from 'vitest'
import {
  generateArgon2Salt,
  deriveMasterSecret,
  deriveUserKeys,
  encryptBytes,
  decryptBytes,
  generateFek,
  wrapFek,
  unwrapFek,
  generateShareLinkKey,
  wrapFekForLink,
  unwrapFekFromLink,
  encryptMetadata,
  decryptMetadata,
  encryptKeyBundle,
  decryptKeyBundle,
} from '../lib/crypto'

// ─── Key derivation ───────────────────────────────────────────────────────────

describe('generateArgon2Salt', () => {
  it('returns a Uint8Array of the correct length', async () => {
    const salt = await generateArgon2Salt()
    expect(salt).toBeInstanceOf(Uint8Array)
    expect(salt.length).toBe(16)
  })
})

describe('deriveMasterSecret', () => {
  it('returns 64 bytes', async () => {
    const salt   = await generateArgon2Salt()
    const secret = await deriveMasterSecret('my-passphrase', salt)
    expect(secret.length).toBe(64)
  })

  it('is deterministic given same passphrase + salt', async () => {
    const salt = new Uint8Array(16).fill(42)
    const s1 = await deriveMasterSecret('hello', salt)
    const s2 = await deriveMasterSecret('hello', salt)
    expect(s1).toEqual(s2)
  })

  it('produces different output for different passphrases', async () => {
    const salt = new Uint8Array(16).fill(7)
    const s1 = await deriveMasterSecret('pass1', salt)
    const s2 = await deriveMasterSecret('pass2', salt)
    expect(s1).not.toEqual(s2)
  })
})

describe('deriveUserKeys', () => {
  it('returns identity and signing keypairs', async () => {
    const master = new Uint8Array(64).fill(1)
    const keys = await deriveUserKeys(master)
    expect(keys.identity.publicKey).toBeInstanceOf(Uint8Array)
    expect(keys.identity.privateKey).toBeInstanceOf(Uint8Array)
    expect(keys.signing.publicKey).toBeInstanceOf(Uint8Array)
    expect(keys.signing.privateKey).toBeInstanceOf(Uint8Array)
  })

  it('identity and signing keys are different', async () => {
    const master = new Uint8Array(64).fill(5)
    const keys = await deriveUserKeys(master)
    expect(keys.identity.publicKey).not.toEqual(keys.signing.publicKey)
  })
})

// ─── File encryption ──────────────────────────────────────────────────────────

describe('encryptBytes / decryptBytes', () => {
  it('round-trips plaintext', async () => {
    const fek       = await generateFek()
    const plaintext = new Uint8Array([1, 2, 3, 4, 5])
    const encrypted = await encryptBytes(plaintext, fek)
    const decrypted = await decryptBytes(encrypted, fek)
    expect(decrypted).toEqual(plaintext)
  })

  it('encrypted output is longer than input (header + MAC)', async () => {
    const fek       = await generateFek()
    const plaintext = new Uint8Array(100)
    const encrypted = await encryptBytes(plaintext, fek)
    expect(encrypted.length).toBeGreaterThan(plaintext.length)
  })
})

// ─── FEK wrapping ─────────────────────────────────────────────────────────────

describe('wrapFek / unwrapFek', () => {
  it('round-trips the FEK', async () => {
    const master = new Uint8Array(64).fill(1)
    const keys   = await deriveUserKeys(master)
    const fek    = await generateFek()

    const wrapped   = await wrapFek(fek, keys.identity.publicKey)
    const unwrapped = await unwrapFek(wrapped, keys.identity.publicKey, keys.identity.privateKey)
    expect(unwrapped).toEqual(fek)
  })
})

// ─── Share link key ───────────────────────────────────────────────────────────

describe('wrapFekForLink / unwrapFekFromLink', () => {
  it('round-trips the FEK through a link key', async () => {
    const fek     = await generateFek()
    const linkKey = await generateShareLinkKey()

    const wrapped   = await wrapFekForLink(fek, linkKey)
    const unwrapped = await unwrapFekFromLink(wrapped, linkKey)
    expect(unwrapped).toEqual(fek)
  })
})

// ─── Metadata ────────────────────────────────────────────────────────────────

describe('encryptMetadata / decryptMetadata', () => {
  it('round-trips arbitrary JSON', async () => {
    const fek  = await generateFek()
    const data = { name: 'vacation.jpg', size: 1024, tags: ['beach'] }
    const enc  = await encryptMetadata(data, fek)
    const dec  = await decryptMetadata<typeof data>(enc, fek)
    expect(dec).toEqual(data)
  })
})

// ─── Key bundle ───────────────────────────────────────────────────────────────

describe('encryptKeyBundle / decryptKeyBundle', () => {
  it('round-trips the user keypair', async () => {
    const master = new Uint8Array(64).fill(9)
    const keys   = await deriveUserKeys(master)

    const enc      = await encryptKeyBundle(keys, master)
    const restored = await decryptKeyBundle(enc, master)

    expect(restored.identity.publicKey).toEqual(keys.identity.publicKey)
    expect(restored.identity.privateKey).toEqual(keys.identity.privateKey)
    expect(restored.signing.publicKey).toEqual(keys.signing.publicKey)
    expect(restored.signing.privateKey).toEqual(keys.signing.privateKey)
  })
})
