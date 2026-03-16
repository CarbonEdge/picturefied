import { getSodium } from './sodium.js'
import {
  ARGON2_MEMLIMIT,
  ARGON2_OPSLIMIT,
  KEY_BYTES,
  KDF_CTX_PRIVATE_KEYS,
  KEY_BUNDLE_VERSION,
} from './constants.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdentityKeyPair {
  /** X25519 public key — stored on server in plaintext */
  publicKey: Uint8Array
  /** X25519 private key — encrypted before leaving the device */
  privateKey: Uint8Array
}

export interface SigningKeyPair {
  /** Ed25519 public key — stored on server in plaintext */
  publicKey: Uint8Array
  /** Ed25519 private key — encrypted before leaving the device */
  privateKey: Uint8Array
}

export interface UserKeyBundle {
  identity: IdentityKeyPair
  signing: SigningKeyPair
}

/**
 * What gets sent to the server for storage.
 * The server holds encrypted private keys and plaintext public keys.
 * It cannot decrypt without the user's master secret.
 */
export interface EncryptedPrivateKeyBundle {
  version: number
  /** X25519 private key, encrypted with master secret subkey */
  encryptedIdentityPrivateKey: Uint8Array
  /** Ed25519 private key, encrypted with master secret subkey */
  encryptedSigningPrivateKey: Uint8Array
  /** Argon2id salt — server stores this, returned at login so client can re-derive master secret */
  argon2Salt: Uint8Array
}

/**
 * Serialised form for the server API (all Uint8Arrays as base64url strings).
 */
export interface SerializedKeyBundle {
  version: number
  encryptedIdentityPrivateKey: string
  encryptedSigningPrivateKey: string
  argon2Salt: string
  identityPublicKey: string
  signingPublicKey: string
}

// ─── Functions ────────────────────────────────────────────────────────────────

/** Generate a fresh X25519 + Ed25519 key bundle for a new user. */
export async function generateUserKeys(): Promise<UserKeyBundle> {
  const sodium = await getSodium()
  const identityKp = sodium.crypto_box_keypair()
  const signingKp = sodium.crypto_sign_keypair()
  return {
    identity: { publicKey: identityKp.publicKey, privateKey: identityKp.privateKey },
    signing:  { publicKey: signingKp.publicKey,  privateKey: signingKp.privateKey },
  }
}

/** Generate a fresh random Argon2id salt. Call once per user, store on server. */
export async function generateArgon2Salt(): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
}

/**
 * Derive the 32-byte master secret from the user's password.
 * This is the root of all key material — it never leaves the device.
 *
 * @param password  Raw password string
 * @param salt      Argon2id salt retrieved from the server at login
 */
export async function deriveMasterSecret(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium()
  return sodium.crypto_pwhash(
    KEY_BYTES,
    password,
    salt,
    ARGON2_OPSLIMIT,
    ARGON2_MEMLIMIT,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )
}

/**
 * Encrypt private keys with a subkey derived from the master secret.
 * The result is safe to send to the server.
 */
export async function encryptPrivateKeyBundle(
  keys: UserKeyBundle,
  masterSecret: Uint8Array,
  argon2Salt: Uint8Array,
): Promise<EncryptedPrivateKeyBundle> {
  const sodium = await getSodium()

  // Derive a dedicated subkey for encrypting private keys (domain-separated)
  const encKey = sodium.crypto_kdf_derive_from_key(KEY_BYTES, 1, KDF_CTX_PRIVATE_KEYS, masterSecret)
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES

  const idNonce  = sodium.randombytes_buf(nonceLen)
  const sigNonce = sodium.randombytes_buf(nonceLen)

  const encryptedIdentityPrivateKey = concat(idNonce,  sodium.crypto_secretbox_easy(keys.identity.privateKey, idNonce,  encKey))
  const encryptedSigningPrivateKey  = concat(sigNonce, sodium.crypto_secretbox_easy(keys.signing.privateKey,  sigNonce, encKey))

  sodium.memzero(encKey)

  return {
    version: KEY_BUNDLE_VERSION,
    encryptedIdentityPrivateKey,
    encryptedSigningPrivateKey,
    argon2Salt,
  }
}

/**
 * Decrypt private keys using the master secret.
 * Called on every login, result held in memory only.
 */
export async function decryptPrivateKeyBundle(
  bundle: EncryptedPrivateKeyBundle,
  keys: { identityPublicKey: Uint8Array; signingPublicKey: Uint8Array },
  masterSecret: Uint8Array,
): Promise<UserKeyBundle> {
  const sodium = await getSodium()

  const encKey  = sodium.crypto_kdf_derive_from_key(KEY_BYTES, 1, KDF_CTX_PRIVATE_KEYS, masterSecret)
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES

  const idNonce   = bundle.encryptedIdentityPrivateKey.slice(0, nonceLen)
  const idCt      = bundle.encryptedIdentityPrivateKey.slice(nonceLen)
  const identityPrivateKey = sodium.crypto_secretbox_open_easy(idCt, idNonce, encKey)

  const sigNonce  = bundle.encryptedSigningPrivateKey.slice(0, nonceLen)
  const sigCt     = bundle.encryptedSigningPrivateKey.slice(nonceLen)
  const signingPrivateKey  = sodium.crypto_secretbox_open_easy(sigCt, sigNonce, encKey)

  sodium.memzero(encKey)

  return {
    identity: { publicKey: keys.identityPublicKey, privateKey: identityPrivateKey },
    signing:  { publicKey: keys.signingPublicKey,  privateKey: signingPrivateKey },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}
