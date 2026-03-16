/**
 * Keystore tests — in-memory key management.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useKeystore } from '../lib/keystore'
import type { UserKeyBundle } from '../lib/crypto'

function makeKeys(): UserKeyBundle {
  return {
    identity: { publicKey: new Uint8Array(32).fill(1), privateKey: new Uint8Array(32).fill(2) },
    signing:  { publicKey: new Uint8Array(32).fill(3), privateKey: new Uint8Array(64).fill(4) },
  }
}

function makeDrive() {
  return {} as never
}

function makeIndex() {
  return {} as never
}

beforeEach(() => {
  const { result } = renderHook(() => useKeystore())
  act(() => result.current.clearSession())
})

describe('initial state', () => {
  it('starts locked', () => {
    const { result } = renderHook(() => useKeystore())
    expect(result.current.isUnlocked()).toBe(false)
  })

  it('keys, drive, index are null', () => {
    const { result } = renderHook(() => useKeystore())
    expect(result.current.keys).toBeNull()
    expect(result.current.drive).toBeNull()
    expect(result.current.index).toBeNull()
  })
})

describe('setSession', () => {
  it('unlocks the keystore', () => {
    const { result } = renderHook(() => useKeystore())
    act(() => result.current.setSession(makeKeys(), makeDrive(), makeIndex()))
    expect(result.current.isUnlocked()).toBe(true)
  })

  it('stores the provided keys', () => {
    const { result } = renderHook(() => useKeystore())
    const keys = makeKeys()
    act(() => result.current.setSession(keys, makeDrive(), makeIndex()))
    expect(result.current.keys?.identity.publicKey).toEqual(new Uint8Array(32).fill(1))
  })
})

describe('clearSession', () => {
  it('locks after clear', () => {
    const { result } = renderHook(() => useKeystore())
    act(() => result.current.setSession(makeKeys(), makeDrive(), makeIndex()))
    act(() => result.current.clearSession())
    expect(result.current.isUnlocked()).toBe(false)
  })

  it('zeroes the private key bytes', () => {
    const { result } = renderHook(() => useKeystore())
    const keys = makeKeys()
    const privRef = keys.identity.privateKey

    act(() => result.current.setSession(keys, makeDrive(), makeIndex()))
    act(() => result.current.clearSession())

    expect(privRef.every((b) => b === 0)).toBe(true)
  })

  it('is safe to call when already locked (idempotent)', () => {
    const { result } = renderHook(() => useKeystore())
    expect(() => {
      act(() => result.current.clearSession())
      act(() => result.current.clearSession())
    }).not.toThrow()
  })
})
