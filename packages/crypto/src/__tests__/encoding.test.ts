import { describe, it, expect } from 'vitest'
import { toBase64url, fromBase64url, toHex, fromHex } from '../encoding.js'

describe('toBase64url / fromBase64url', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255, 42, 99])
    expect(fromBase64url(toBase64url(original))).toEqual(original)
  })

  it('produces URL-safe output (no +, /, or = characters)', () => {
    // Run against many byte values to trigger all base64 character ranges
    for (let i = 0; i < 256; i++) {
      const b64 = toBase64url(new Uint8Array([i]))
      expect(b64).not.toMatch(/[+/=]/)
    }
  })

  it('round-trips an empty array', () => {
    const empty = new Uint8Array(0)
    expect(fromBase64url(toBase64url(empty))).toEqual(empty)
  })

  it('round-trips 32 random-ish bytes (key-sized)', () => {
    const key = new Uint8Array(32).map((_, i) => i * 7 % 256)
    expect(fromBase64url(toBase64url(key))).toEqual(key)
  })

  it('decodes strings with padding stripped', () => {
    // "hello" in base64url without padding
    const encoded = toBase64url(new TextEncoder().encode('hello'))
    expect(fromBase64url(encoded)).toEqual(new TextEncoder().encode('hello'))
  })
})

describe('toHex / fromHex', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0xab, 0xff])
    expect(fromHex(toHex(bytes))).toEqual(bytes)
  })

  it('produces lowercase hex', () => {
    expect(toHex(new Uint8Array([0xab, 0xcd]))).toBe('abcd')
  })

  it('zero-pads single-digit nibbles', () => {
    expect(toHex(new Uint8Array([0x0f]))).toBe('0f')
  })

  it('throws on odd-length hex string', () => {
    expect(() => fromHex('abc')).toThrow()
  })

  it('round-trips 32 bytes (hash-sized)', () => {
    const hash = new Uint8Array(32).map((_, i) => i)
    expect(fromHex(toHex(hash))).toEqual(hash)
  })
})
