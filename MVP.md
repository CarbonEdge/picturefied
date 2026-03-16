# Picturefied — MVP Specification

**Version:** 1.0
**Status:** Pre-development
**Last Updated:** 2026-03-16

---

## What We're Building

Picturefied is an open-source, privacy-first photo and file sharing application. The guiding principle is **zero trust by default** — nothing is ever visible to anyone unless the owner explicitly chooses to share it.

Unlike Instagram or Google Photos, Picturefied:
- Encrypts every file on the user's device before it ever touches the network
- Stores files in a backend the user controls (their own S3 bucket, local server, etc.)
- Never lets the server read file contents or encryption keys — ever
- Allows sharing without giving up ownership

The MVP proves this model works end-to-end with a clean, usable product.

---

## MVP Scope

The MVP is intentionally narrow. It establishes the cryptographic foundation, the storage abstraction, and the core user workflow — upload, organize, share. Everything else builds on top of this.

**In scope for MVP:**
- Account creation and login (passkeys + password fallback)
- Client-side key generation and recovery phrase setup
- Encrypted file upload and download (images and files, up to 2GB)
- Client-side thumbnail generation with encrypted storage
- Album creation and management
- Link-based file and album sharing with expiry and revocation
- Two storage backends: Local filesystem and S3-compatible
- Self-hosting via Docker Compose

**Out of scope for MVP (V2+):**
- User-to-user sharing (requires recipient account lookup + FEK re-encryption)
- Video streaming
- Mobile app
- Google Drive / Nextcloud backends
- Comments and activity feed
- Search
- Key rotation

---

## Current State

The repository is empty beyond the initial commit. No code has been written yet.

```
D:/dev/picturefied/
├── .git/
└── README.md       ← only file that exists
```

Everything needs to be built from scratch.

---

## Repository Structure (Target)

```
picturefied/
├── apps/
│   ├── api/                    ← Hono.js REST API (Node.js)
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts   ← Drizzle schema (all tables)
│   │   │   │   └── migrations/ ← Auto-generated migration files
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts     ← Registration, login, sessions
│   │   │   │   ├── keys.ts     ← Public key registry, encrypted private key bundle
│   │   │   │   ├── files.ts    ← Upload intent, complete, list, download URL, delete
│   │   │   │   ├── albums.ts   ← Create, list, add/remove files
│   │   │   │   └── shares.ts   ← Create, revoke, resolve link shares
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts     ← JWT verification
│   │   │   │   └── ratelimit.ts
│   │   │   └── index.ts        ← App entry point
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── web/                    ← Next.js 15 frontend
│       ├── src/
│       │   ├── app/            ← App Router pages
│       │   │   ├── (auth)/     ← Login, register, recovery
│       │   │   ├── gallery/    ← Main photo grid view
│       │   │   ├── albums/     ← Album management
│       │   │   └── s/[token]/  ← Public share link viewer
│       │   ├── lib/
│       │   │   ├── keystore.ts ← In-memory key store (Zustand) — keys never persisted
│       │   │   ├── crypto.ts   ← Thin wrapper around libsodium for app use cases
│       │   │   └── api.ts      ← Typed API client (fetch wrapper)
│       │   ├── components/
│       │   │   ├── uploader/   ← Drag-drop upload with progress, runs encryption in worker
│       │   │   ├── gallery/    ← Photo grid, blurhash placeholders, lazy decrypt
│       │   │   └── share/      ← Share modal and link management
│       │   └── workers/
│       │       └── crypto.worker.ts ← Web Worker: encrypt/decrypt off the main thread
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   ├── crypto/                 ← Shared crypto primitives (used by api + web)
│   │   └── src/
│   │       └── index.ts        ← Key gen, FEK wrap/unwrap, file encrypt/decrypt, blurhash
│   └── storage/                ← Storage adapter interface + implementations
│       └── src/
│           ├── adapter.ts      ← StorageAdapter interface
│           ├── local.ts        ← Local filesystem adapter
│           └── s3.ts           ← S3-compatible adapter (AWS, R2, MinIO, Wasabi)
│
├── docker-compose.yml          ← postgres + valkey + api + web + caddy
├── Caddyfile                   ← Reverse proxy config, auto-TLS
└── package.json                ← Workspace root (pnpm workspaces)
```

---

## User Flows

### 1. Registration

```
User opens app
  → Enters handle + optional email
  → Client generates Identity Key Pair (X25519) + Signing Key Pair (Ed25519) using libsodium
  → Client derives Master Secret from password via Argon2id (never leaves device)
  → Private keys are encrypted with Master Secret → encrypted bundle sent to server
  → Public keys sent to server in plaintext (needed for share re-encryption later)
  → Server creates user record, stores public keys + encrypted private key bundle
  → Client shown 24-word recovery phrase (encodes a Shamir share of Master Secret)
  → User must confirm phrase before proceeding
  → JWT issued, user lands on (empty) gallery
```

### 2. Upload a Photo

```
User drags photo into upload zone (or clicks upload)
  → Web Worker receives the file bytes
  → Worker generates random 256-bit FEK
  → Worker generates thumbnail (Canvas API, max 400px), generates blurhash string
  → Worker encrypts file with FEK (XChaCha20-Poly1305)
  → Worker encrypts thumbnail with a separate thumbnail FEK
  → Worker wraps both FEKs with user's Identity Public Key (X25519 box)
  → Worker encrypts file metadata (filename, size, taken_at, mime hint) as JSON blob
  → Main thread requests presigned upload URL from API (POST /files/upload/intent)
  → API creates file record (incomplete), returns presigned URL for storage backend
  → Worker uploads encrypted file blob directly to storage (S3 PUT / local endpoint)
  → Main thread confirms upload to API (POST /files/upload/complete)
    body: { fileId, wrappedFek, wrappedThumbnailFek, encryptedMetadata, blurhash, thumbnailRef }
  → API marks file as upload_completed = true
  → Gallery updates with blurhash placeholder → thumbnail loads → full image on click
```

### 3. View Gallery

```
User lands on gallery page
  → API returns list of file records (encrypted metadata blobs + wrapped FEKs)
  → Web Worker unwraps all FEKs using user's Identity Private Key (loaded from keystore)
  → Gallery renders blurhash placeholders immediately (no decryption needed)
  → As thumbnails enter viewport: Worker fetches encrypted thumbnail blob, decrypts, renders
  → Click a photo: Worker fetches encrypted full file, decrypts, renders in lightbox
  → Decrypted keys are held in memory only (Zustand store), never written to disk
```

### 4. Share via Link

```
User right-clicks photo → "Share"
  → Client generates random 256-bit shareLinkKey
  → Client decrypts the file's FEK (using their private key from keystore)
  → Client re-encrypts FEK with shareLinkKey using secretbox (symmetric)
  → POST /shares with: { resourceType: 'file', resourceId, shareType: 'link',
      linkWrappedFek, expiresAt, permissions: { view: true, download: false } }
  → Server stores share record, returns shareToken
  → Client constructs share URL: https://[host]/s/[shareToken]#[base64url(shareLinkKey)]
  → The #fragment is never sent to the server (HTTP spec)
  → User copies link and sends it

Recipient opens link:
  → Page loads, JS extracts shareLinkKey from #fragment
  → Fetches GET /s/[shareToken] → receives encrypted blob URL + linkWrappedFek
  → Client decrypts FEK: secretbox.open(linkWrappedFek, shareLinkKey)
  → Fetches encrypted file from storage, decrypts with FEK
  → Displays file — no account required

Owner revokes:
  → DELETE /shares/[shareId]
  → Server deletes the share row
  → The old URL now returns 404 — the shareLinkKey in the URL is useless without the server record
```

### 5. Create Album

```
User clicks "New Album"
  → Enters album name
  → Client encrypts album name + description as JSON blob using their Identity Public Key
  → POST /albums with encryptedMetadata blob
  → Album appears in sidebar
  → User selects photos → "Add to Album" → POST /albums/[id]/files
  → Album view: same gallery flow but scoped to album's file list
```

---

## Cryptographic Specification

All cryptography uses **libsodium** primitives. No custom crypto.

| Operation | Primitive | Notes |
|---|---|---|
| File encryption | `XChaCha20-Poly1305` | 24-byte random nonce prepended to ciphertext |
| FEK wrapping (own key) | `crypto_box_seal` (X25519 + XChaCha20-Poly1305) | Asymmetric, authenticated |
| FEK wrapping (link share) | `crypto_secretbox` (XChaCha20-Poly1305) | Symmetric, key embedded in URL fragment |
| Key derivation from password | `Argon2id` | memory=64MB, time=3, parallelism=4 |
| Private key derivation from master | `HKDF-SHA512` | Domain-separated per key type |
| Content hash (dedup) | `BLAKE3` | Computed client-side, not used for security |
| Signing (file authorship) | `Ed25519` | For future share verification |
| Random generation | `libsodium.randombytes_buf` | CSPRNG, never Math.random() |

### Key Storage Rules
- **Master Secret:** Never stored anywhere. Re-derived from password on every login.
- **Private keys:** Stored on server encrypted with Master Secret. Fetched and decrypted on login.
- **Decrypted private keys:** Held in Zustand store (memory only). Zeroed on logout via `sodium_memzero`.
- **FEKs (decrypted):** Held in memory only for the duration of the encrypt/decrypt operation. Never stored.
- **FEKs (wrapped):** Stored in the `files` and `shares` tables as opaque BYTEA.

---

## API Endpoints (MVP)

### Auth
```
POST   /api/v1/auth/register/begin       Start registration ceremony
POST   /api/v1/auth/register/complete    Complete registration, receive JWT
POST   /api/v1/auth/login/begin          Start login (passkey challenge or password)
POST   /api/v1/auth/login/complete       Complete login, receive JWT + refresh token
POST   /api/v1/auth/refresh              Exchange refresh token for new JWT
POST   /api/v1/auth/logout               Revoke refresh token
```

### Keys
```
GET    /api/v1/keys/me                   Get own public keys
PUT    /api/v1/keys/me                   Upload/rotate public keys
GET    /api/v1/keys/me/private           Get encrypted private key bundle
PUT    /api/v1/keys/me/private           Store new encrypted private key bundle
```

### Files
```
POST   /api/v1/files/upload/intent       Get presigned upload URL → { uploadUrl, fileId }
POST   /api/v1/files/upload/complete     Confirm upload, store wrapped FEKs + metadata
GET    /api/v1/files                     List files (paginated) → encrypted metadata + wrapped FEKs
GET    /api/v1/files/:fileId             Single file record
GET    /api/v1/files/:fileId/download    Get presigned download URL
DELETE /api/v1/files/:fileId             Soft delete
```

### Albums
```
POST   /api/v1/albums                    Create album
GET    /api/v1/albums                    List albums
GET    /api/v1/albums/:albumId           Album detail + file list
PATCH  /api/v1/albums/:albumId           Update encrypted metadata
DELETE /api/v1/albums/:albumId           Delete album
POST   /api/v1/albums/:albumId/files     Add files to album
DELETE /api/v1/albums/:albumId/files/:fileId  Remove file from album
```

### Shares
```
POST   /api/v1/shares                    Create share (link or future user share)
GET    /api/v1/shares                    List my active shares
DELETE /api/v1/shares/:shareId           Revoke share
GET    /api/v1/s/:token                  Public — resolve link share (no auth required)
                                         Returns: { encryptedFileUrl, linkWrappedFek }
                                         Rate limited. Logs access_count.
```

---

## Database Schema (MVP)

```sql
-- Users
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle      TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- Passkeys (WebAuthn credentials)
CREATE TABLE passkeys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  credential_id BYTEA UNIQUE NOT NULL,
  public_key    BYTEA NOT NULL,
  sign_count    BIGINT NOT NULL DEFAULT 0,
  device_name   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

-- Password auth (fallback)
CREATE TABLE user_passwords (
  user_id        UUID PRIMARY KEY REFERENCES users(id),
  password_hash  TEXT NOT NULL,   -- Argon2id hash
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cryptographic key material
CREATE TABLE user_keys (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id),
  key_type              TEXT NOT NULL,  -- 'identity' | 'signing'
  algorithm             TEXT NOT NULL,  -- 'x25519' | 'ed25519'
  public_key            BYTEA NOT NULL,
  encrypted_private_key BYTEA NOT NULL, -- private key encrypted with master secret
  version               INTEGER NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at            TIMESTAMPTZ
);

-- Session refresh tokens
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_hash    TEXT  -- BLAKE3(ip), never raw IP
);

-- Files (core entity)
CREATE TABLE files (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             UUID NOT NULL REFERENCES users(id),
  storage_backend      TEXT NOT NULL,  -- 'local' | 's3'
  storage_reference    TEXT NOT NULL,  -- opaque backend handle
  encrypted_metadata   BYTEA NOT NULL, -- { filename, size, taken_at, mime_hint, tags }
  wrapped_fek          BYTEA NOT NULL, -- FEK encrypted with owner's identity public key
  thumbnail_reference  TEXT,           -- storage ref to encrypted thumbnail blob
  wrapped_thumbnail_fek BYTEA,         -- thumbnail FEK wrapped with owner's public key
  blurhash             TEXT,           -- 48-byte blurhash string, stored plaintext
  content_hash         BYTEA,          -- BLAKE3(plaintext), client-computed, for dedup
  upload_completed     BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

-- Albums
CREATE TABLE albums (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID NOT NULL REFERENCES users(id),
  encrypted_metadata BYTEA NOT NULL,  -- { name, description }
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);

-- Album membership
CREATE TABLE album_files (
  album_id   UUID NOT NULL REFERENCES albums(id),
  file_id    UUID NOT NULL REFERENCES files(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, file_id)
);

-- Shares
CREATE TABLE shares (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grantor_id       UUID NOT NULL REFERENCES users(id),
  file_id          UUID REFERENCES files(id),
  album_id         UUID REFERENCES albums(id),
  share_type       TEXT NOT NULL DEFAULT 'link',  -- 'link' only for MVP
  permissions      JSONB NOT NULL DEFAULT '{"view": true, "download": false}',
  share_token      TEXT UNIQUE NOT NULL,          -- random, used in URL path
  link_wrapped_fek BYTEA NOT NULL,                -- FEK encrypted with shareLinkKey (key is in URL fragment)
  expires_at       TIMESTAMPTZ,
  max_access_count INTEGER,
  access_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  CONSTRAINT share_has_resource CHECK (
    (file_id IS NOT NULL AND album_id IS NULL) OR
    (file_id IS NULL AND album_id IS NOT NULL)
  )
);
```

---

## Storage Backends (MVP)

### Interface (TypeScript)

```typescript
interface StorageAdapter {
  put(path: string, data: ReadableStream, sizeBytes: number): Promise<{ reference: string }>;
  getPresignedUploadUrl(path: string, sizeBytes: number): Promise<{ url: string; method: 'PUT' | 'POST'; headers: Record<string, string>; reference: string }>;
  confirmUpload(reference: string): Promise<void>;
  getPresignedDownloadUrl(reference: string, expiresInSeconds: number): Promise<string>;
  delete(reference: string): Promise<void>;
  healthCheck(): Promise<{ ok: boolean }>;
}
```

### Local Filesystem
- Files stored under a configurable `STORAGE_ROOT` directory
- Download served via authenticated streaming endpoint (not presigned — no external URL)
- Reference = relative path from storage root
- Good for: single-server self-hosted setups, development

### S3-Compatible
- Covers AWS S3, Cloudflare R2, MinIO, Wasabi, Backblaze B2
- Full presigned URL support — client uploads/downloads directly, API only orchestrates
- Reference = bucket + object key
- Bucket should be private; presigned URLs grant time-limited access
- Good for: production deployments, multi-user instances

---

## Self-Hosting (Docker Compose)

One command to run a full instance:

```bash
git clone https://github.com/picturefied/picturefied
cd picturefied
cp .env.example .env   # edit with your domain and storage config
docker compose up -d
```

Services:
- `api` — Hono.js API server
- `web` — Next.js frontend
- `postgres` — PostgreSQL 16 (persistent volume)
- `valkey` — Redis-compatible cache (persistent volume)
- `caddy` — Reverse proxy with automatic Let's Encrypt TLS

Minimum server requirements: **1 vCPU, 1GB RAM, 20GB disk**
(Storage offloaded to S3 backend; local adapter needs additional disk proportional to usage)

### Environment Configuration

```env
# Required
DATABASE_URL=postgresql://picturefied:password@postgres:5432/picturefied
REDIS_URL=redis://valkey:6379
JWT_SECRET=<random 64-byte hex>
DOMAIN=photos.yourdomain.com

# Storage backend (pick one)
STORAGE_BACKEND=local
STORAGE_ROOT=/data/files

# Or: S3-compatible
STORAGE_BACKEND=s3
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=us-east-1

# Optional
INVITE_ONLY=false          # set true to require invite codes for registration
SMTP_HOST=...              # for share notification emails (optional)
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

---

## Security Properties

| Property | How it's achieved |
|---|---|
| Server cannot read files | Files encrypted client-side before upload; FEKs never sent to server in plaintext |
| Server cannot read metadata | Metadata (filename, date, tags) encrypted in the same blob with the FEK |
| Share links don't leak key to server | Share key embedded in URL `#fragment`, which browsers never send in HTTP requests |
| Revocation is immediate | Deleting a share row makes the `linkWrappedFek` on the server unretrievable |
| Storage provider cannot read files | Encrypted blobs at rest; provider holds ciphertext only |
| IP address privacy | IPs hashed (BLAKE3) before storage in audit log, never stored raw |
| No tracking pixels or analytics | Open source; self-hosted; zero third-party scripts by default |
| Password never sent to server | Argon2id runs client-side; only the JWT auth ceremony hits the network |

---

## What's Not Secure (Known Trade-offs for MVP)

These are conscious decisions for MVP simplicity, to be addressed in V2:

1. **No forward secrecy for shares.** If a user's private key is compromised, all past shares can be decrypted. Proxy re-encryption (V3) fully addresses this.
2. **Thumbnails are a separate encrypted blob.** If an attacker gained access to the storage backend and the thumbnail FEK (from the database), they could see thumbnails. Both pieces must be compromised simultaneously.
3. **No client-side EXIF stripping in MVP.** EXIF data (including GPS coordinates) is encrypted in the metadata blob, so it's private — but it's not stripped before upload. V2 adds opt-in EXIF stripping.
4. **Recovery phrase is the only key recovery method.** Social recovery and multi-device sync are V2 features. Users who lose their recovery phrase and forget their password lose access to their keys (files remain in storage but are unrecoverable).

---

## Build Order

Build in this sequence to avoid rework:

1. **`packages/crypto`** — libsodium wrappers, key gen, FEK encrypt/decrypt. Everything depends on this.
2. **`packages/storage`** — StorageAdapter interface, local adapter, S3 adapter.
3. **`apps/api` — database schema + migrations** (Drizzle).
4. **`apps/api` — auth routes** (`/auth`, `/keys`).
5. **`apps/api` — file routes** (`/files`).
6. **`apps/api` — album + share routes** (`/albums`, `/shares`, `/s/:token`).
7. **`apps/web` — keystore + crypto worker** (client-side key management).
8. **`apps/web` — auth pages** (register, login, recovery phrase).
9. **`apps/web` — gallery + uploader** (main feature).
10. **`apps/web` — albums + share modal**.
11. **`apps/web` — share link viewer** (`/s/[token]` page, no auth required).
12. **Docker Compose + Caddyfile** — wire everything together.
13. **`.env.example` + setup docs**.

---

## Success Criteria for MVP

The MVP is done when:

- [ ] A user can register with a passkey or password on a self-hosted instance
- [ ] A user is shown and must confirm a recovery phrase during registration
- [ ] A user can upload a photo; it is encrypted before leaving the browser
- [ ] The gallery displays photos (via decrypted thumbnails); the server holds only ciphertext
- [ ] A user can share a photo via link; the recipient can view it without an account
- [ ] Revoking a share makes the link immediately non-functional
- [ ] A user can create albums and organize photos into them
- [ ] The entire stack runs with `docker compose up` on a fresh Linux server
- [ ] The server database contains no plaintext file content or unencrypted keys
