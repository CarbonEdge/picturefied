import { getSodium } from './sodium.js'
import { KEY_BYTES } from './constants.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Everything the server needs to store for a file.
 * All blobs are opaque to the server.
 */
export interface EncryptedFilePayload {
  /** Encrypted file bytes (nonce prepended). Upload to storage backend. */
  encryptedFile: Uint8Array
  /** FEK encrypted with the owner's X25519 public key. Store in DB. */
  wrappedFek: Uint8Array
  /** Encrypted thumbnail bytes (nonce prepended). Upload to storage backend. */
  encryptedThumbnail: Uint8Array
  /** Thumbnail FEK encrypted with the owner's X25519 public key. Store in DB. */
  wrappedThumbnailFek: Uint8Array
  /** Encrypted JSON metadata blob (nonce prepended). Store in DB. */
  encryptedMetadata: Uint8Array
  /** Blurhash string — safe to store plaintext, too abstract to be sensitive. */
  blurhash: string
  /** BLAKE2b-256 hash of the plaintext file bytes. Used for client-side dedup. */
  contentHash: Uint8Array
}

export interface FileMetadata {
  filename: string
  mimeTypeHint: string
  sizeBytes: number
  /** ISO 8601 — from EXIF taken_at if available, otherwise upload time */
  takenAt: string
  tags: string[]
  description?: string
}

// ─── File Encryption Key ──────────────────────────────────────────────────────

/** Generate a random 256-bit File Encryption Key. */
export async function generateFek(): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.randombytes_buf(KEY_BYTES)
}

// ─── Symmetric Encrypt / Decrypt ─────────────────────────────────────────────

/**
 * Encrypt arbitrary bytes with a FEK.
 * Output format: [24-byte nonce | ciphertext+tag]
 *
 * NOTE: For files >100MB, use the streaming variant (encryptStream) instead
 * to avoid loading the entire file into memory. TODO: implement in V2.
 */
export async function encryptBytes(plaintext: Uint8Array, fek: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium()
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, fek)
  return concat(nonce, ciphertext)
}

/** Decrypt bytes previously encrypted with encryptBytes. */
export async function decryptBytes(encrypted: Uint8Array, fek: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium()
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES
  const nonce      = encrypted.slice(0, nonceLen)
  const ciphertext = encrypted.slice(nonceLen)
  return sodium.crypto_secretbox_open_easy(ciphertext, nonce, fek)
}

// ─── FEK Wrapping (Asymmetric — for own key and user-to-user shares) ──────────

/**
 * Encrypt a FEK with a recipient's X25519 public key.
 * Uses crypto_box_seal (anonymous sender, X25519 ECDH + XSalsa20-Poly1305).
 * The owner calls this with their own public key to store wrapped FEKs in the DB.
 */
export async function wrapFek(fek: Uint8Array, recipientPublicKey: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.crypto_box_seal(fek, recipientPublicKey)
}

/**
 * Decrypt a FEK wrapped with the caller's public key.
 * Requires both the public and private key of the recipient.
 */
export async function unwrapFek(
  wrappedFek: Uint8Array,
  recipientPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.crypto_box_seal_open(wrappedFek, recipientPublicKey, recipientPrivateKey)
}

// ─── FEK Wrapping (Symmetric — for link shares) ───────────────────────────────

/**
 * Generate a random 256-bit share link key.
 * This key is embedded in the share URL fragment (#) — never sent to the server.
 */
export async function generateShareLinkKey(): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.randombytes_buf(KEY_BYTES)
}

/**
 * Wrap a FEK with a symmetric share link key.
 * Output: [nonce | encrypted FEK]
 */
export async function wrapFekForLink(fek: Uint8Array, shareLinkKey: Uint8Array): Promise<Uint8Array> {
  return encryptBytes(fek, shareLinkKey)
}

/** Unwrap a link-share FEK using the key from the URL fragment. */
export async function unwrapFekFromLink(wrapped: Uint8Array, shareLinkKey: Uint8Array): Promise<Uint8Array> {
  return decryptBytes(wrapped, shareLinkKey)
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

/** Encrypt a FileMetadata object. Uses the same FEK as the file. */
export async function encryptMetadata(metadata: FileMetadata, fek: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium()
  const json = new TextEncoder().encode(JSON.stringify(metadata))
  void sodium // ensure initialized
  return encryptBytes(json, fek)
}

/** Decrypt and parse a FileMetadata object. */
export async function decryptMetadata(encrypted: Uint8Array, fek: Uint8Array): Promise<FileMetadata> {
  const plain = await decryptBytes(encrypted, fek)
  return JSON.parse(new TextDecoder().decode(plain)) as FileMetadata
}

// ─── Content Hash ─────────────────────────────────────────────────────────────

/**
 * BLAKE2b-256 hash of plaintext file bytes.
 * Computed client-side for deduplication. Not used for security.
 */
export async function contentHash(data: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.crypto_generichash(32, data)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}
