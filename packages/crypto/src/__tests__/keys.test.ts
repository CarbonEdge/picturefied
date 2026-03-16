import { describe, it, expect, beforeAll } from 'vitest'
import {
  getSodium,
  generateUserKeys,
  generateArgon2Salt,
  deriveMasterSecret,
  encryptPrivateKeyBundle,
  decryptPrivateKeyBundle,
} from '../index.js'

// libsodium WASM must be ready before any crypto operation
beforeAll(async () => { await getSodium() })

describe('generateUserKeys', () => {
  it('returns an identity (X25519) key pair with correct sizes', async () => {
    const sodium = await getSodium()
    const keys = await generateUserKeys()
    expect(keys.identity.publicKey.length).toBe(sodium.crypto_box_PUBLICKEYBYTES)
    expect(keys.identity.privateKey.length).toBe(sodium.crypto_box_SECRETKEYBYTES)
  })

  it('returns a signing (Ed25519) key pair with correct sizes', async () => {
    const sodium = await getSodium()
    const keys = await generateUserKeys()
    expect(keys.signing.publicKey.length).toBe(sodium.crypto_sign_PUBLICKEYBYTES)
    expect(keys.signing.privateKey.length).toBe(sodium.crypto_sign_SECRETKEYBYTES)
  })

  it('generates different keys on each call', async () => {
    const a = await generateUserKeys()
    const b = await generateUserKeys()
    expect(a.identity.publicKey).not.toEqual(b.identity.publicKey)
    expect(a.signing.publicKey).not.toEqual(b.signing.publicKey)
  })
})

describe('generateArgon2Salt', () => {
  it('returns a salt of the correct length', async () => {
    const sodium = await getSodium()
    const salt = await generateArgon2Salt()
    expect(salt.length).toBe(sodium.crypto_pwhash_SALTBYTES)
  })

  it('returns different salts on each call', async () => {
    const a = await generateArgon2Salt()
    const b = await generateArgon2Salt()
    expect(a).not.toEqual(b)
  })
})

describe('deriveMasterSecret', () => {
  it('returns a 32-byte key', async () => {
    const salt = await generateArgon2Salt()
    const secret = await deriveMasterSecret('test-password-123', salt)
    expect(secret.length).toBe(32)
  })

  it('is deterministic: same password + salt always produces the same key', async () => {
    const salt = await generateArgon2Salt()
    const a = await deriveMasterSecret('my-password', salt)
    const b = await deriveMasterSecret('my-password', salt)
    expect(a).toEqual(b)
  })

  it('produces different keys for different passwords', async () => {
    const salt = await generateArgon2Salt()
    const a = await deriveMasterSecret('password-a', salt)
    const b = await deriveMasterSecret('password-b', salt)
    expect(a).not.toEqual(b)
  })

  it('produces different keys for different salts', async () => {
    const saltA = await generateArgon2Salt()
    const saltB = await generateArgon2Salt()
    const a = await deriveMasterSecret('same-password', saltA)
    const b = await deriveMasterSecret('same-password', saltB)
    expect(a).not.toEqual(b)
  })
})

describe('encryptPrivateKeyBundle / decryptPrivateKeyBundle (round-trip)', () => {
  it('decrypts back to the original keys', async () => {
    const originalKeys  = await generateUserKeys()
    const salt          = await generateArgon2Salt()
    const masterSecret  = await deriveMasterSecret('correct-password', salt)

    const bundle = await encryptPrivateKeyBundle(originalKeys, masterSecret, salt)
    const pubKeys = {
      identityPublicKey: originalKeys.identity.publicKey,
      signingPublicKey:  originalKeys.signing.publicKey,
    }
    const recovered = await decryptPrivateKeyBundle(bundle, pubKeys, masterSecret)

    expect(recovered.identity.publicKey).toEqual(originalKeys.identity.publicKey)
    expect(recovered.identity.privateKey).toEqual(originalKeys.identity.privateKey)
    expect(recovered.signing.publicKey).toEqual(originalKeys.signing.publicKey)
    expect(recovered.signing.privateKey).toEqual(originalKeys.signing.privateKey)
  })

  it('throws when decrypted with the wrong master secret', async () => {
    const keys         = await generateUserKeys()
    const salt         = await generateArgon2Salt()
    const correctSecret = await deriveMasterSecret('correct-password', salt)
    const wrongSecret   = await deriveMasterSecret('wrong-password',   salt)

    const bundle = await encryptPrivateKeyBundle(keys, correctSecret, salt)
    const pubKeys = {
      identityPublicKey: keys.identity.publicKey,
      signingPublicKey:  keys.signing.publicKey,
    }

    await expect(decryptPrivateKeyBundle(bundle, pubKeys, wrongSecret)).rejects.toThrow()
  })

  it('stores the argon2 salt in the bundle', async () => {
    const keys   = await generateUserKeys()
    const salt   = await generateArgon2Salt()
    const secret = await deriveMasterSecret('pw', salt)
    const bundle = await encryptPrivateKeyBundle(keys, secret, salt)
    expect(bundle.argon2Salt).toEqual(salt)
  })

  it('produces different ciphertext on each call (random nonces)', async () => {
    const keys   = await generateUserKeys()
    const salt   = await generateArgon2Salt()
    const secret = await deriveMasterSecret('pw', salt)
    const a = await encryptPrivateKeyBundle(keys, secret, salt)
    const b = await encryptPrivateKeyBundle(keys, secret, salt)
    expect(a.encryptedIdentityPrivateKey).not.toEqual(b.encryptedIdentityPrivateKey)
  })
})
