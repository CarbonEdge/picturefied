/**
 * Encoding utilities for passing binary data through JSON APIs.
 * Uses base64url (no padding) — URL-safe, compact.
 */

export function toBase64url(bytes: Uint8Array): string {
  // btoa is available in both modern browsers and Node 16+
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function fromBase64url(str: string): Uint8Array {
  // Re-add padding if stripped
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
  const binary = atob(padded)
  return new Uint8Array(Array.from(binary, (c) => c.charCodeAt(0)))
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
