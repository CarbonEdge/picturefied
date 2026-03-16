/**
 * Crypto Web Worker
 *
 * All heavy crypto runs here — off the main thread — so the UI never freezes
 * during file encryption/decryption.
 *
 * Keys are passed in per-operation and immediately cleared after use.
 * They are NEVER stored in the worker.
 */

import {
  getSodium,
  generateFek,
  encryptBytes,
  decryptBytes,
  wrapFek,
  unwrapFek,
  wrapFekForLink,
  generateShareLinkKey,
  encryptMetadata,
  contentHash,
  toBase64url,
  fromBase64url,
  type FileMetadata,
} from '@picturefied/crypto'

// ─── Message types ────────────────────────────────────────────────────────────

export type WorkerRequest =
  | { id: string; type: 'ENCRYPT_FILE';     payload: EncryptFilePayload }
  | { id: string; type: 'DECRYPT_FILE';     payload: DecryptFilePayload }
  | { id: string; type: 'ENCRYPT_THUMB';    payload: EncryptThumbPayload }
  | { id: string; type: 'DECRYPT_THUMB';    payload: DecryptThumbPayload }
  | { id: string; type: 'CREATE_SHARE_KEY'; payload: CreateShareKeyPayload }

export type WorkerResponse =
  | { id: string; type: 'ENCRYPT_FILE_RESULT';     result: EncryptFileResult }
  | { id: string; type: 'DECRYPT_FILE_RESULT';     result: Uint8Array }
  | { id: string; type: 'ENCRYPT_THUMB_RESULT';    result: EncryptThumbResult }
  | { id: string; type: 'DECRYPT_THUMB_RESULT';    result: Uint8Array }
  | { id: string; type: 'CREATE_SHARE_KEY_RESULT'; result: CreateShareKeyResult }
  | { id: string; type: 'ERROR';                   error: string }

interface EncryptFilePayload {
  fileBytes:         Uint8Array
  metadata:          FileMetadata
  ownerPublicKey:    Uint8Array  // X25519 identity public key
}

interface EncryptFileResult {
  encryptedFile:     Uint8Array
  wrappedFek:        string  // base64url
  encryptedMetadata: string  // base64url
  contentHash:       string  // base64url
}

interface EncryptThumbPayload {
  thumbBytes:        Uint8Array
  ownerPublicKey:    Uint8Array
}

interface EncryptThumbResult {
  encryptedThumb:      Uint8Array
  wrappedThumbnailFek: string  // base64url
}

interface DecryptFilePayload {
  encryptedFile:    Uint8Array
  wrappedFek:       string  // base64url
  ownerPublicKey:   Uint8Array
  ownerPrivateKey:  Uint8Array
}

interface DecryptThumbPayload {
  encryptedThumb:      Uint8Array
  wrappedThumbnailFek: string  // base64url
  ownerPublicKey:      Uint8Array
  ownerPrivateKey:     Uint8Array
}

interface CreateShareKeyPayload {
  wrappedFek:      string  // base64url — the owner's wrapped FEK
  ownerPublicKey:  Uint8Array
  ownerPrivateKey: Uint8Array
}

interface CreateShareKeyResult {
  shareLinkKey:   string  // base64url — embed in URL fragment
  linkWrappedFek: string  // base64url — send to server
}

// ─── Handler ──────────────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  try {
    await getSodium() // ensure libsodium is ready

    switch (msg.type) {
      case 'ENCRYPT_FILE': {
        const { fileBytes, metadata, ownerPublicKey } = msg.payload
        const fek          = await generateFek()
        const encFile      = await encryptBytes(fileBytes, fek)
        const encMeta      = await encryptMetadata(metadata, fek)
        const wFek         = await wrapFek(fek, ownerPublicKey)
        const hash         = await contentHash(fileBytes)

        fek.fill(0)  // zero FEK as soon as we're done with it

        const result: EncryptFileResult = {
          encryptedFile:     encFile,
          wrappedFek:        toBase64url(wFek),
          encryptedMetadata: toBase64url(encMeta),
          contentHash:       toBase64url(hash),
        }
        self.postMessage({ id: msg.id, type: 'ENCRYPT_FILE_RESULT', result } satisfies WorkerResponse)
        break
      }

      case 'ENCRYPT_THUMB': {
        const { thumbBytes, ownerPublicKey } = msg.payload
        const fek     = await generateFek()
        const encThumb = await encryptBytes(thumbBytes, fek)
        const wFek    = await wrapFek(fek, ownerPublicKey)

        fek.fill(0)

        const result: EncryptThumbResult = {
          encryptedThumb:      encThumb,
          wrappedThumbnailFek: toBase64url(wFek),
        }
        self.postMessage({ id: msg.id, type: 'ENCRYPT_THUMB_RESULT', result } satisfies WorkerResponse)
        break
      }

      case 'DECRYPT_FILE': {
        const { encryptedFile, wrappedFek, ownerPublicKey, ownerPrivateKey } = msg.payload
        const fek       = await unwrapFek(fromBase64url(wrappedFek), ownerPublicKey, ownerPrivateKey)
        const plaintext = await decryptBytes(encryptedFile, fek)
        fek.fill(0)
        self.postMessage({ id: msg.id, type: 'DECRYPT_FILE_RESULT', result: plaintext } satisfies WorkerResponse)
        break
      }

      case 'DECRYPT_THUMB': {
        const { encryptedThumb, wrappedThumbnailFek, ownerPublicKey, ownerPrivateKey } = msg.payload
        const fek       = await unwrapFek(fromBase64url(wrappedThumbnailFek), ownerPublicKey, ownerPrivateKey)
        const plaintext = await decryptBytes(encryptedThumb, fek)
        fek.fill(0)
        self.postMessage({ id: msg.id, type: 'DECRYPT_THUMB_RESULT', result: plaintext } satisfies WorkerResponse)
        break
      }

      case 'CREATE_SHARE_KEY': {
        const { wrappedFek, ownerPublicKey, ownerPrivateKey } = msg.payload
        const fek          = await unwrapFek(fromBase64url(wrappedFek), ownerPublicKey, ownerPrivateKey)
        const shareLinkKey = await generateShareLinkKey()
        const linkWrapped  = await wrapFekForLink(fek, shareLinkKey)

        fek.fill(0)

        const result: CreateShareKeyResult = {
          shareLinkKey:   toBase64url(shareLinkKey),
          linkWrappedFek: toBase64url(linkWrapped),
        }
        self.postMessage({ id: msg.id, type: 'CREATE_SHARE_KEY_RESULT', result } satisfies WorkerResponse)
        break
      }
    }
  } catch (err) {
    self.postMessage({ id: msg.id, type: 'ERROR', error: String(err) } satisfies WorkerResponse)
  }
}
