'use client'

/**
 * In-memory keystore — the crown jewel of the client-side security model.
 *
 * Rules:
 * 1. Decrypted private keys are NEVER written to localStorage, sessionStorage,
 *    IndexedDB, or any other persistent storage.
 * 2. Keys live only in this Zustand store (JS heap memory).
 * 3. On logout, memzero() is called on all key material before clearing state.
 * 4. Web Workers receive copies of keys only for the duration of a single
 *    encrypt/decrypt operation — never stored in the worker.
 */

import { create } from 'zustand'
import type { UserKeyBundle } from '@picturefied/crypto'

interface KeystoreState {
  keys: UserKeyBundle | null
  userId: string | null
  handle: string | null

  /** Called after successful login + key decryption. */
  setKeys: (keys: UserKeyBundle, userId: string, handle: string) => void

  /** Wipe all key material from memory. Call on logout. */
  clearKeys: () => void

  /** True if the user has keys loaded and is ready to encrypt/decrypt. */
  isUnlocked: () => boolean
}

export const useKeystore = create<KeystoreState>((set, get) => ({
  keys:   null,
  userId: null,
  handle: null,

  setKeys(keys, userId, handle) {
    set({ keys, userId, handle })
  },

  clearKeys() {
    const { keys } = get()
    if (keys) {
      // Zero out key material before releasing the reference.
      // libsodium's memzero is the correct way to do this.
      // Since we're outside the crypto module here, we do it manually.
      zeroBytes(keys.identity.privateKey)
      zeroBytes(keys.identity.publicKey)
      zeroBytes(keys.signing.privateKey)
      zeroBytes(keys.signing.publicKey)
    }
    set({ keys: null, userId: null, handle: null })
  },

  isUnlocked() {
    return get().keys !== null
  },
}))

/** Overwrite a Uint8Array with zeros. */
function zeroBytes(buf: Uint8Array): void {
  buf.fill(0)
}
