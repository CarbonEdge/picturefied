import { describe, it, expect, beforeAll } from 'vitest'
import {
  getSodium,
  masterSecretToMnemonic,
  mnemonicToMasterSecret,
  generateRandomMasterSecret,
  isValidMnemonic,
} from '../index.js'

beforeAll(async () => { await getSodium() })

describe('masterSecretToMnemonic', () => {
  it('produces a 24-word mnemonic from a 32-byte secret', async () => {
    const { masterSecret } = await generateRandomMasterSecret()
    const mnemonic = masterSecretToMnemonic(masterSecret)
    const words = mnemonic.split(' ')
    expect(words).toHaveLength(24)
  })

  it('throws for a secret that is not 32 bytes', () => {
    expect(() => masterSecretToMnemonic(new Uint8Array(16))).toThrow()
    expect(() => masterSecretToMnemonic(new Uint8Array(31))).toThrow()
    expect(() => masterSecretToMnemonic(new Uint8Array(33))).toThrow()
  })

  it('is deterministic', async () => {
    const { masterSecret } = await generateRandomMasterSecret()
    const a = masterSecretToMnemonic(masterSecret)
    const b = masterSecretToMnemonic(masterSecret)
    expect(a).toBe(b)
  })
})

describe('mnemonicToMasterSecret', () => {
  it('round-trips: encodes and decodes back to the same secret', async () => {
    const { masterSecret } = await generateRandomMasterSecret()
    const mnemonic  = masterSecretToMnemonic(masterSecret)
    const recovered = mnemonicToMasterSecret(mnemonic)
    expect(recovered).not.toBeNull()
    expect(recovered).toEqual(masterSecret)
  })

  it('returns null for an invalid mnemonic', () => {
    expect(mnemonicToMasterSecret('not a valid mnemonic phrase')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(mnemonicToMasterSecret('')).toBeNull()
  })

  it('is case-insensitive', async () => {
    const { masterSecret, mnemonic } = await generateRandomMasterSecret()
    const upper = mnemonic.toUpperCase()
    const recovered = mnemonicToMasterSecret(upper)
    expect(recovered).toEqual(masterSecret)
  })

  it('handles extra whitespace gracefully', async () => {
    const { masterSecret, mnemonic } = await generateRandomMasterSecret()
    const spaced = '  ' + mnemonic.split(' ').join('   ') + '  '
    const recovered = mnemonicToMasterSecret(spaced)
    expect(recovered).toEqual(masterSecret)
  })
})

describe('generateRandomMasterSecret', () => {
  it('returns a 32-byte master secret', async () => {
    const { masterSecret } = await generateRandomMasterSecret()
    expect(masterSecret.length).toBe(32)
  })

  it('returns a valid 24-word mnemonic', async () => {
    const { mnemonic } = await generateRandomMasterSecret()
    expect(mnemonic.split(' ')).toHaveLength(24)
    expect(isValidMnemonic(mnemonic)).toBe(true)
  })

  it('generates different secrets on each call', async () => {
    const a = await generateRandomMasterSecret()
    const b = await generateRandomMasterSecret()
    expect(a.masterSecret).not.toEqual(b.masterSecret)
  })
})

describe('isValidMnemonic', () => {
  it('returns true for a valid mnemonic', async () => {
    const { mnemonic } = await generateRandomMasterSecret()
    expect(isValidMnemonic(mnemonic)).toBe(true)
  })

  it('returns false for random words', () => {
    expect(isValidMnemonic('hello world foo bar baz qux one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour')).toBe(false)
  })

  it('returns false for a partial mnemonic', async () => {
    const { mnemonic } = await generateRandomMasterSecret()
    const partial = mnemonic.split(' ').slice(0, 12).join(' ')
    expect(isValidMnemonic(partial)).toBe(false)
  })
})
