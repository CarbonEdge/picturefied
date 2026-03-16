import { generateMnemonic, mnemonicToEntropy, entropyToMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { getSodium } from './sodium.js'

/**
 * Encode a 32-byte master secret as a 24-word BIP39 mnemonic.
 * 256 bits of entropy → 24 words.
 *
 * This phrase IS the master secret. If the user forgets their password,
 * they can use this phrase to recover their keys.
 */
export function masterSecretToMnemonic(masterSecret: Uint8Array): string {
  if (masterSecret.length !== 32) {
    throw new Error(`Expected 32 bytes, got ${masterSecret.length}`)
  }
  return entropyToMnemonic(masterSecret, wordlist)
}

/**
 * Recover a master secret from a BIP39 mnemonic phrase.
 * Returns null if the mnemonic is invalid.
 */
export function mnemonicToMasterSecret(mnemonic: string): Uint8Array | null {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!validateMnemonic(normalized, wordlist)) return null
  return mnemonicToEntropy(normalized, wordlist)
}

/**
 * Generate a brand-new random master secret and its mnemonic in one shot.
 * Use this for the passkey auth path where the password is not available
 * to derive a master secret via Argon2id.
 */
export async function generateRandomMasterSecret(): Promise<{
  masterSecret: Uint8Array
  mnemonic: string
}> {
  const sodium = await getSodium()
  const masterSecret = sodium.randombytes_buf(32)
  const mnemonic = masterSecretToMnemonic(masterSecret)
  return { masterSecret, mnemonic }
}

/** Validate a mnemonic phrase without recovering the secret. */
export function isValidMnemonic(mnemonic: string): boolean {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ')
  return validateMnemonic(normalized, wordlist)
}
