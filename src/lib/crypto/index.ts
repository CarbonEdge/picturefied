/**
 * Browser crypto primitives using libsodium-wrappers-sumo.
 *
 * All heavy operations (encrypt/decrypt large files) are delegated to
 * the crypto Web Worker to keep the main thread unblocked.
 *
 * This module exposes only key-derivation, key-generation, and small
 * metadata operations that are fast enough to run synchronously.
 */
import _sodium from 'libsodium-wrappers-sumo'

export type { _sodium as Sodium }

let _ready: Promise<typeof _sodium> | null = null

export async function getSodium(): Promise<typeof _sodium> {
  if (!_ready) {
    _ready = (async () => {
      await _sodium.ready
      return _sodium
    })()
  }
  return _ready
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Argon2id parameters — enough to be slow on commodity hardware
export const ARGON2_OPSLIMIT = 3          // iterations
export const ARGON2_MEMLIMIT = 64 * 1024 * 1024  // 64 MB

// KDF sub-key contexts (must be exactly 8 bytes)
export const CTX_IDENTITY = 'picid001'   // X25519 keypair
export const CTX_SIGNING  = 'picsig01'   // Ed25519 keypair
export const CTX_CONFIG   = 'piccfg01'   // config.enc encryption key

// ─── Encoding helpers ─────────────────────────────────────────────────────────

export function toBase64url(bytes: Uint8Array): string {
  const sodium = _sodium
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING)
}

export function fromBase64url(str: string): Uint8Array {
  const sodium = _sodium
  return sodium.from_base64(str, sodium.base64_variants.URLSAFE_NO_PADDING)
}

export function toHex(bytes: Uint8Array): string {
  return _sodium.to_hex(bytes)
}

export function fromHex(hex: string): Uint8Array {
  return _sodium.from_hex(hex)
}

// ─── Key derivation ───────────────────────────────────────────────────────────

export interface UserKeyBundle {
  identity: { publicKey: Uint8Array; privateKey: Uint8Array }
  signing:  { publicKey: Uint8Array; privateKey: Uint8Array }
}

export async function generateArgon2Salt(): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
}

/**
 * Derives a 64-byte master secret from passphrase + salt using Argon2id.
 * Runs ~2-3 seconds intentionally — happens once per login.
 */
export async function deriveMasterSecret(
  passphrase: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.crypto_pwhash(
    64,
    passphrase,
    salt,
    ARGON2_OPSLIMIT,
    ARGON2_MEMLIMIT,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )
}

/**
 * Derives user keypairs deterministically from master secret.
 * Master secret → 32-byte sub-keys via BLAKE2b KDF → keypairs.
 */
export async function deriveUserKeys(masterSecret: Uint8Array): Promise<UserKeyBundle> {
  const sodium = await getSodium()
  const keyId = 1

  const identitySeed = sodium.crypto_kdf_derive_from_key(
    32, keyId, CTX_IDENTITY, masterSecret.slice(0, 32),
  )
  const signingSeed = sodium.crypto_kdf_derive_from_key(
    32, keyId, CTX_SIGNING, masterSecret.slice(0, 32),
  )

  const identity = sodium.crypto_box_seed_keypair(identitySeed)
  const signing  = sodium.crypto_sign_seed_keypair(signingSeed)

  // Zero seeds immediately
  identitySeed.fill(0)
  signingSeed.fill(0)

  return {
    identity: { publicKey: identity.publicKey, privateKey: identity.privateKey },
    signing:  { publicKey: signing.publicKey,  privateKey: signing.privateKey  },
  }
}

// ─── File encryption ──────────────────────────────────────────────────────────

export async function generateFek(): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.randombytes_buf(sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES)
}

export async function encryptBytes(
  plaintext: Uint8Array,
  fek: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(fek)
  const ciphertext = sodium.crypto_secretstream_xchacha20poly1305_push(
    state,
    plaintext,
    null,
    sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL,
  )
  // Prepend 24-byte header so decrypt knows the nonce
  const out = new Uint8Array(header.length + ciphertext.length)
  out.set(header, 0)
  out.set(ciphertext, header.length)
  return out
}

export async function decryptBytes(
  ciphertext: Uint8Array,
  fek: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  const headerLen = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES
  const header    = ciphertext.slice(0, headerLen)
  const body      = ciphertext.slice(headerLen)

  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, fek)
  const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, body)
  if (!result) throw new Error('Decryption failed — ciphertext is corrupt or key is wrong')
  return result.message
}

// ─── FEK wrapping ─────────────────────────────────────────────────────────────

/**
 * Wraps a file encryption key with the owner's X25519 public key.
 * Only the holder of the matching private key can unwrap it.
 */
export async function wrapFek(
  fek: Uint8Array,
  recipientPublicKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.crypto_box_seal(fek, recipientPublicKey)
}

export async function unwrapFek(
  wrappedFek: Uint8Array,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  const fek = sodium.crypto_box_seal_open(wrappedFek, publicKey, privateKey)
  if (!fek) throw new Error('FEK unwrap failed — wrong key')
  return fek
}

// ─── Share link key ───────────────────────────────────────────────────────────

/**
 * Generates a one-time key for embedding in a share link URL fragment.
 * This key is used to re-encrypt (wrap) the FEK; the wrapped FEK is stored
 * on Google Drive in the shared/ folder. The link key itself lives only in
 * the URL #fragment — never sent to any server.
 */
export async function generateShareLinkKey(): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES)
}

export async function wrapFekForLink(
  fek: Uint8Array,
  linkKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const cipher = sodium.crypto_secretbox_easy(fek, nonce, linkKey)
  const out = new Uint8Array(nonce.length + cipher.length)
  out.set(nonce, 0)
  out.set(cipher, nonce.length)
  return out
}

export async function unwrapFekFromLink(
  wrappedFek: Uint8Array,
  linkKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES
  const nonce    = wrappedFek.slice(0, nonceLen)
  const cipher   = wrappedFek.slice(nonceLen)
  const fek = sodium.crypto_secretbox_open_easy(cipher, nonce, linkKey)
  if (!fek) throw new Error('Link FEK unwrap failed')
  return fek
}

// ─── Metadata encryption ──────────────────────────────────────────────────────

export async function encryptMetadata(
  data: unknown,
  fek: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  const json = JSON.stringify(data)
  const bytes = new TextEncoder().encode(json)
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const cipher = sodium.crypto_secretbox_easy(bytes, nonce, fek)
  const out = new Uint8Array(nonce.length + cipher.length)
  out.set(nonce, 0)
  out.set(cipher, nonce.length)
  return out
}

export async function decryptMetadata<T = unknown>(
  ciphertext: Uint8Array,
  fek: Uint8Array,
): Promise<T> {
  const sodium = await getSodium()
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES
  const nonce    = ciphertext.slice(0, nonceLen)
  const cipher   = ciphertext.slice(nonceLen)
  const bytes = sodium.crypto_secretbox_open_easy(cipher, nonce, fek)
  if (!bytes) throw new Error('Metadata decryption failed')
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

// ─── Config bundle (config.enc) ──────────────────────────────────────────────

export interface StoredConfig {
  version: 1
  argon2Salt: string          // base64url
  encryptedKeyBundle: string  // base64url — box_seal of JSON keypair
}

/**
 * Encrypts the user's keypair for storage in config.enc on Google Drive.
 * The config key is derived from the master secret using the CTX_CONFIG context.
 */
export async function encryptKeyBundle(
  keys: UserKeyBundle,
  masterSecret: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  const configKey = sodium.crypto_kdf_derive_from_key(
    32, 1, CTX_CONFIG, masterSecret.slice(0, 32),
  )
  const payload = {
    identityPublicKey:  toBase64url(keys.identity.publicKey),
    identityPrivateKey: toBase64url(keys.identity.privateKey),
    signingPublicKey:   toBase64url(keys.signing.publicKey),
    signingPrivateKey:  toBase64url(keys.signing.privateKey),
  }
  const result = await encryptMetadata(payload, configKey)
  configKey.fill(0)
  return result
}

export async function decryptKeyBundle(
  ciphertext: Uint8Array,
  masterSecret: Uint8Array,
): Promise<UserKeyBundle> {
  const sodium = await getSodium()
  const configKey = sodium.crypto_kdf_derive_from_key(
    32, 1, CTX_CONFIG, masterSecret.slice(0, 32),
  )
  const payload = await decryptMetadata<{
    identityPublicKey: string; identityPrivateKey: string
    signingPublicKey: string;  signingPrivateKey: string
  }>(ciphertext, configKey)
  configKey.fill(0)
  return {
    identity: {
      publicKey:  fromBase64url(payload.identityPublicKey),
      privateKey: fromBase64url(payload.identityPrivateKey),
    },
    signing: {
      publicKey:  fromBase64url(payload.signingPublicKey),
      privateKey: fromBase64url(payload.signingPrivateKey),
    },
  }
}

// ─── Recovery phrase ──────────────────────────────────────────────────────────

export { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
export { wordlist as englishWordlist } from '@scure/bip39/wordlists/english'

export async function masterSecretToMnemonic(masterSecret: Uint8Array): Promise<string> {
  const { entropyToMnemonic } = await import('@scure/bip39')
  const { wordlist } = await import('@scure/bip39/wordlists/english')
  // Use first 32 bytes as entropy → 24-word mnemonic
  return entropyToMnemonic(masterSecret.slice(0, 32), wordlist)
}

export async function mnemonicToMasterSecret(mnemonic: string): Promise<Uint8Array> {
  const { mnemonicToEntropy } = await import('@scure/bip39')
  const { wordlist } = await import('@scure/bip39/wordlists/english')
  return mnemonicToEntropy(mnemonic.toLowerCase().trim(), wordlist)
}
