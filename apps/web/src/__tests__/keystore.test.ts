/**
 * Keystore tests — the trust boundary between encrypted server state and
 * the user's plaintext view.
 *
 * Critical invariants we verify:
 * 1. Keys are only held after setKeys is called
 * 2. clearKeys zeroes key material and clears all state
 * 3. isUnlocked reflects whether keys are present
 * 4. Multiple calls to setKeys replace the previous keys
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useKeystore } from '../lib/keystore.js'
import type { UserKeyBundle } from '@picturefied/crypto'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeKeyBundle(): UserKeyBundle {
  return {
    identity: {
      publicKey:  new Uint8Array(32).fill(1),
      privateKey: new Uint8Array(32).fill(2),
    },
    signing: {
      publicKey:  new Uint8Array(32).fill(3),
      privateKey: new Uint8Array(64).fill(4),
    },
  }
}

// Reset the Zustand store before each test
beforeEach(() => {
  const { result } = renderHook(() => useKeystore())
  act(() => { result.current.clearKeys() })
})

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with no keys', () => {
    const { result } = renderHook(() => useKeystore())
    expect(result.current.keys).toBeNull()
  })

  it('starts with no userId or handle', () => {
    const { result } = renderHook(() => useKeystore())
    expect(result.current.userId).toBeNull()
    expect(result.current.handle).toBeNull()
  })

  it('isUnlocked returns false when no keys are loaded', () => {
    const { result } = renderHook(() => useKeystore())
    expect(result.current.isUnlocked()).toBe(false)
  })
})

// ─── setKeys ─────────────────────────────────────────────────────────────────

describe('setKeys', () => {
  it('loads keys, userId, and handle into the store', () => {
    const { result } = renderHook(() => useKeystore())
    const bundle = makeKeyBundle()

    act(() => { result.current.setKeys(bundle, 'user-123', 'alice') })

    expect(result.current.keys).not.toBeNull()
    expect(result.current.userId).toBe('user-123')
    expect(result.current.handle).toBe('alice')
  })

  it('isUnlocked returns true after setKeys', () => {
    const { result } = renderHook(() => useKeystore())
    act(() => { result.current.setKeys(makeKeyBundle(), 'uid', 'bob') })
    expect(result.current.isUnlocked()).toBe(true)
  })

  it('replaces previous keys on subsequent setKeys calls', () => {
    const { result } = renderHook(() => useKeystore())
    act(() => { result.current.setKeys(makeKeyBundle(), 'uid-1', 'alice') })
    act(() => { result.current.setKeys(makeKeyBundle(), 'uid-2', 'bob') })

    expect(result.current.userId).toBe('uid-2')
    expect(result.current.handle).toBe('bob')
  })

  it('stores the exact key bytes passed in', () => {
    const { result } = renderHook(() => useKeystore())
    const bundle = makeKeyBundle()
    act(() => { result.current.setKeys(bundle, 'uid', 'carol') })

    expect(result.current.keys!.identity.publicKey).toEqual(new Uint8Array(32).fill(1))
    expect(result.current.keys!.signing.privateKey).toEqual(new Uint8Array(64).fill(4))
  })
})

// ─── clearKeys ────────────────────────────────────────────────────────────────

describe('clearKeys', () => {
  it('sets keys to null', () => {
    const { result } = renderHook(() => useKeystore())
    act(() => { result.current.setKeys(makeKeyBundle(), 'uid', 'alice') })
    act(() => { result.current.clearKeys() })
    expect(result.current.keys).toBeNull()
  })

  it('sets userId and handle to null', () => {
    const { result } = renderHook(() => useKeystore())
    act(() => { result.current.setKeys(makeKeyBundle(), 'uid', 'alice') })
    act(() => { result.current.clearKeys() })
    expect(result.current.userId).toBeNull()
    expect(result.current.handle).toBeNull()
  })

  it('isUnlocked returns false after clearKeys', () => {
    const { result } = renderHook(() => useKeystore())
    act(() => { result.current.setKeys(makeKeyBundle(), 'uid', 'alice') })
    act(() => { result.current.clearKeys() })
    expect(result.current.isUnlocked()).toBe(false)
  })

  it('zeroes the key material in the Uint8Arrays before clearing', () => {
    const { result } = renderHook(() => useKeystore())
    const bundle = makeKeyBundle()
    const privateKeyRef = bundle.identity.privateKey // keep a reference

    act(() => { result.current.setKeys(bundle, 'uid', 'alice') })

    // Verify keys are loaded (non-zero)
    expect(privateKeyRef.some((b) => b !== 0)).toBe(true)

    act(() => { result.current.clearKeys() })

    // After clear, the original array should be zeroed (memzero equivalent)
    expect(privateKeyRef.every((b) => b === 0)).toBe(true)
  })

  it('is safe to call multiple times (idempotent)', () => {
    const { result } = renderHook(() => useKeystore())
    expect(() => {
      act(() => { result.current.clearKeys() })
      act(() => { result.current.clearKeys() })
    }).not.toThrow()
  })
})
