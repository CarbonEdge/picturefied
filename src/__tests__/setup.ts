/**
 * Vitest global setup — runs before every test file.
 */
import { vi } from 'vitest'

// Mock libsodium so tests don't need WASM
vi.mock('libsodium-wrappers-sumo', () => {
  const mockSodium = {
    ready: Promise.resolve(),
    randombytes_buf: (n: number) => new Uint8Array(n).fill(1),
    crypto_pwhash_SALTBYTES: 16,
    crypto_pwhash_ALG_ARGON2ID13: 2,
    crypto_pwhash: (_len: number, _pw: string, salt: Uint8Array) => {
      // Deterministic mock: XOR the passphrase bytes into a 64-byte buffer
      const out = new Uint8Array(64)
      const enc = new TextEncoder().encode(_pw)
      for (let i = 0; i < 64; i++) out[i] = enc[i % enc.length] ^ salt[i % salt.length]
      return out
    },
    crypto_kdf_derive_from_key: (_len: number, _id: bigint, ctx: string, key: Uint8Array) => {
      const out = new Uint8Array(32)
      const ctxB = new TextEncoder().encode(ctx)
      for (let i = 0; i < 32; i++) out[i] = key[i % key.length] ^ ctxB[i % ctxB.length]
      return out
    },
    crypto_box_seed_keypair: (seed: Uint8Array) => ({
      publicKey: seed.map((b) => b ^ 0xAA),
      privateKey: seed,
    }),
    crypto_sign_seed_keypair: (seed: Uint8Array) => ({
      publicKey: seed.map((b) => b ^ 0x55),
      privateKey: new Uint8Array(64).fill(0).map((_, i) => seed[i % 32]),
    }),
    crypto_secretstream_xchacha20poly1305_KEYBYTES: 32,
    crypto_secretstream_xchacha20poly1305_HEADERBYTES: 24,
    crypto_secretstream_xchacha20poly1305_TAG_FINAL: 0,
    crypto_secretstream_xchacha20poly1305_init_push: () => ({
      state: {},
      header: new Uint8Array(24).fill(0xAB),
    }),
    crypto_secretstream_xchacha20poly1305_push: (_s: unknown, msg: Uint8Array) => {
      // Fake encryption: XOR with 0xFF
      return msg.map((b) => b ^ 0xFF)
    },
    crypto_secretstream_xchacha20poly1305_init_pull: () => ({}),
    crypto_secretstream_xchacha20poly1305_pull: (_s: unknown, body: Uint8Array) => ({
      message: body.map((b) => b ^ 0xFF),
    }),
    crypto_box_seal: (msg: Uint8Array) => {
      const out = new Uint8Array(msg.length + 48)
      out.set(new Uint8Array(48).fill(0xCC), 0)
      out.set(msg, 48)
      return out
    },
    crypto_box_seal_open: (sealed: Uint8Array) => sealed.slice(48),
    crypto_secretbox_KEYBYTES: 32,
    crypto_secretbox_NONCEBYTES: 24,
    crypto_secretbox_easy: (msg: Uint8Array, nonce: Uint8Array) => {
      const mac = new Uint8Array(16).fill(0xDD)
      const ct  = msg.map((b, i) => b ^ nonce[i % nonce.length])
      const out = new Uint8Array(mac.length + ct.length)
      out.set(mac)
      out.set(ct, mac.length)
      return out
    },
    crypto_secretbox_open_easy: (ct: Uint8Array, nonce: Uint8Array) => {
      const body = ct.slice(16)
      return body.map((b, i) => b ^ nonce[i % nonce.length])
    },
    to_base64: (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url'),
    from_base64: (s: string) => new Uint8Array(Buffer.from(s, 'base64url')),
    to_hex: (bytes: Uint8Array) => Buffer.from(bytes).toString('hex'),
    from_hex: (s: string) => new Uint8Array(Buffer.from(s, 'hex')),
    base64_variants: { URLSAFE_NO_PADDING: 'urlsafe_no_padding' },
  }
  return { default: mockSodium, ...mockSodium }
})
