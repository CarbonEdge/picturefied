/**
 * In-memory keystore (Zustand).
 *
 * Keys are NEVER written to localStorage, sessionStorage, or IndexedDB.
 * They live only in JS memory. Refreshing the page requires re-unlocking.
 *
 * The store also holds references to the DriveAdapter and IndexManager
 * so components don't have to thread them as props.
 */
import { create } from 'zustand'
import type { UserKeyBundle } from './crypto'
import type { DriveAdapter } from './storage/gdrive'
import type { IndexManager } from './index-manager'

interface KeystoreState {
  keys: UserKeyBundle | null
  drive: DriveAdapter | null
  index: IndexManager | null

  setSession: (keys: UserKeyBundle, drive: DriveAdapter, index: IndexManager) => void
  clearSession: () => void
  isUnlocked: () => boolean
}

export const useKeystore = create<KeystoreState>()((set, get) => ({
  keys:  null,
  drive: null,
  index: null,

  setSession(keys, drive, index) {
    set({ keys, drive, index })
  },

  clearSession() {
    const { keys } = get()
    if (keys) {
      // Zero key material before releasing references
      keys.identity.privateKey.fill(0)
      keys.identity.publicKey.fill(0)
      keys.signing.privateKey.fill(0)
      keys.signing.publicKey.fill(0)
    }
    set({ keys: null, drive: null, index: null })
  },

  isUnlocked() {
    return get().keys !== null
  },
}))
