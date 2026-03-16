// Re-export everything from sub-modules for a clean single import surface.

export { getSodium } from './sodium.js'

export {
  generateUserKeys,
  generateArgon2Salt,
  deriveMasterSecret,
  encryptPrivateKeyBundle,
  decryptPrivateKeyBundle,
} from './keys.js'

export type {
  IdentityKeyPair,
  SigningKeyPair,
  UserKeyBundle,
  EncryptedPrivateKeyBundle,
  SerializedKeyBundle,
} from './keys.js'

export {
  generateFek,
  encryptBytes,
  decryptBytes,
  wrapFek,
  unwrapFek,
  generateShareLinkKey,
  wrapFekForLink,
  unwrapFekFromLink,
  encryptMetadata,
  decryptMetadata,
  contentHash,
} from './file.js'

export type { EncryptedFilePayload, FileMetadata } from './file.js'

export {
  masterSecretToMnemonic,
  mnemonicToMasterSecret,
  generateRandomMasterSecret,
  isValidMnemonic,
} from './recovery.js'

export { toBase64url, fromBase64url, toHex, fromHex } from './encoding.js'
