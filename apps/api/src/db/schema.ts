import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  bytea,
  jsonb,
  timestamp,
  primaryKey,
  check,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:        uuid('id').primaryKey().defaultRandom(),
  handle:    text('handle').notNull().unique(),
  email:     text('email').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// ─── Passkeys (WebAuthn) ──────────────────────────────────────────────────────

export const passkeys = pgTable('passkeys', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id),
  credentialId: bytea('credential_id').notNull().unique(),
  publicKey:    bytea('public_key').notNull(),
  signCount:    bigint('sign_count', { mode: 'number' }).notNull().default(0),
  transports:   text('transports').array(),
  deviceName:   text('device_name'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt:   timestamp('last_used_at', { withTimezone: true }),
}, (t) => [index('passkeys_user_id_idx').on(t.userId)])

// ─── Password Auth (fallback) ─────────────────────────────────────────────────

export const userPasswords = pgTable('user_passwords', {
  userId:       uuid('user_id').primaryKey().references(() => users.id),
  passwordHash: text('password_hash').notNull(), // Argon2id — computed server-side from client-derived hash
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Cryptographic Key Material ───────────────────────────────────────────────

export const userKeys = pgTable('user_keys', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  userId:               uuid('user_id').notNull().references(() => users.id),
  keyType:              text('key_type').notNull(),    // 'identity' | 'signing'
  algorithm:            text('algorithm').notNull(),   // 'x25519' | 'ed25519'
  publicKey:            bytea('public_key').notNull(), // stored plaintext — needed for FEK re-encryption on share
  encryptedPrivateKey:  bytea('encrypted_private_key').notNull(), // encrypted with master secret
  version:              integer('version').notNull().default(1),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt:            timestamp('revoked_at', { withTimezone: true }),
}, (t) => [index('user_keys_user_id_idx').on(t.userId)])

/**
 * The Argon2id salt used to derive this user's master secret.
 * Returned to the client at login so it can re-derive the master secret.
 * One row per user; updated on password change.
 */
export const userArgon2Salts = pgTable('user_argon2_salts', {
  userId:    uuid('user_id').primaryKey().references(() => users.id),
  salt:      bytea('salt').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Session Refresh Tokens ───────────────────────────────────────────────────

export const refreshTokens = pgTable('refresh_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(), // SHA-256 of the raw token
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  ipHash:    text('ip_hash'), // BLAKE2b(ip) — never raw IP
}, (t) => [index('refresh_tokens_user_id_idx').on(t.userId)])

// ─── Files ────────────────────────────────────────────────────────────────────

export const files = pgTable('files', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ownerId:            uuid('owner_id').notNull().references(() => users.id),
  storageBackend:     text('storage_backend').notNull(),  // 'local' | 's3'
  storageReference:   text('storage_reference').notNull(), // opaque backend handle
  encryptedMetadata:  bytea('encrypted_metadata').notNull(), // AES-encrypted JSON: { filename, size, takenAt, mimeHint, tags }
  wrappedFek:         bytea('wrapped_fek').notNull(),         // FEK box-sealed to owner's X25519 public key
  thumbnailReference: text('thumbnail_reference'),
  wrappedThumbnailFek: bytea('wrapped_thumbnail_fek'),
  blurhash:           text('blurhash'),                        // ~48 bytes, safe to store plaintext
  contentHash:        bytea('content_hash'),                   // BLAKE2b-256 of plaintext, client-computed
  uploadCompleted:    boolean('upload_completed').notNull().default(false),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:          timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('files_owner_id_idx').on(t.ownerId),
  index('files_created_at_idx').on(t.createdAt),
])

// ─── Albums ───────────────────────────────────────────────────────────────────

export const albums = pgTable('albums', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ownerId:           uuid('owner_id').notNull().references(() => users.id),
  encryptedMetadata: bytea('encrypted_metadata').notNull(), // { name, description }
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:         timestamp('deleted_at', { withTimezone: true }),
}, (t) => [index('albums_owner_id_idx').on(t.ownerId)])

export const albumFiles = pgTable('album_files', {
  albumId:   uuid('album_id').notNull().references(() => albums.id),
  fileId:    uuid('file_id').notNull().references(() => files.id),
  sortOrder: integer('sort_order').notNull().default(0),
  addedAt:   timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.albumId, t.fileId] }),
])

// ─── Shares ───────────────────────────────────────────────────────────────────

export const shares = pgTable('shares', {
  id:             uuid('id').primaryKey().defaultRandom(),
  grantorId:      uuid('grantor_id').notNull().references(() => users.id),
  fileId:         uuid('file_id').references(() => files.id),
  albumId:        uuid('album_id').references(() => albums.id),
  shareType:      text('share_type').notNull().default('link'), // 'link' for MVP; 'user' in V2
  permissions:    jsonb('permissions').notNull().default(sql`'{"view": true, "download": false}'`),
  shareToken:     text('share_token').notNull().unique(),
  linkWrappedFek: bytea('link_wrapped_fek').notNull(), // FEK symmetrically encrypted with share link key (key is in URL fragment)
  expiresAt:      timestamp('expires_at', { withTimezone: true }),
  maxAccessCount: integer('max_access_count'),
  accessCount:    integer('access_count').notNull().default(0),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt:      timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  index('shares_grantor_id_idx').on(t.grantorId),
  uniqueIndex('shares_token_idx').on(t.shareToken),
  check('share_has_resource', sql`(file_id IS NOT NULL AND album_id IS NULL) OR (file_id IS NULL AND album_id IS NOT NULL)`),
])
