/** Argon2id memory limit: 64MB */
export const ARGON2_MEMLIMIT = 64 * 1024 * 1024

/** Argon2id time/iteration limit */
export const ARGON2_OPSLIMIT = 3

/** Master secret and FEK length in bytes */
export const KEY_BYTES = 32

/** KDF context labels — must be exactly 8 ASCII bytes */
export const KDF_CTX_PRIVATE_KEYS = 'privkeys' as const   // 8 chars ✓
export const KDF_CTX_METADATA     = 'metadata' as const   // 8 chars ✓
export const KDF_CTX_THUMBNAIL    = 'thumbkey' as const   // 8 chars ✓

/** Current key bundle schema version */
export const KEY_BUNDLE_VERSION = 1
