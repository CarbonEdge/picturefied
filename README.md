# picturefied

Open-source, zero-trust alternative to Instagram. You own your files. Nothing is shared unless you explicitly choose to share it.

**Every file is encrypted on your device before it leaves your browser. The server holds ciphertext. Your encryption keys never leave your device.**

---

## Features (MVP)

- Passkey + password authentication
- Client-side E2E encryption (libsodium — XSalsa20-Poly1305 + X25519)
- Encrypted file upload up to 2GB
- Gallery with blurhash placeholders + lazy-decrypted thumbnails
- Albums with encrypted names
- Link-based sharing — decryption key embedded in URL fragment (never sent to server)
- Revocable shares — one click kills the link
- Storage backends: local filesystem, S3-compatible (R2, MinIO, Wasabi, AWS)
- One-command self-hosting via Docker Compose

---

## Quick Start (Self-Hosted)

```bash
git clone https://github.com/picturefied/picturefied
cd picturefied
cp .env.example .env
# Edit .env: set JWT_SECRET, DOMAIN, and storage backend config
docker compose up -d
```

Open `https://your-domain.com` and create your account.

Minimum server: 1 vCPU, 1GB RAM, 20GB disk (more disk if using local storage backend).

---

## Architecture

```
Browser (Next.js)
  └─ Web Worker encrypts files with libsodium before upload
  └─ Keys held in memory only (Zustand) — never persisted
  └─ Encrypted blobs uploaded directly to storage backend

API Server (Hono.js / Node.js)
  └─ Orchestrates uploads, stores encrypted metadata + wrapped keys
  └─ Never sees plaintext file content or unencrypted keys

Storage Backend (pluggable)
  └─ Holds only opaque encrypted ciphertext

PostgreSQL
  └─ Encrypted metadata blobs, wrapped FEKs, ACL, share tokens
```

See [MVP.md](./MVP.md) for the full architecture specification.

---

## Monorepo Structure

```
packages/
  crypto/       Core cryptographic primitives (libsodium wrappers)
  storage/      StorageAdapter interface + Local + S3 implementations

apps/
  api/          Hono.js REST API (Node.js)
  web/          Next.js 15 frontend
```

---

## Development

```bash
pnpm install
pnpm dev          # starts all apps in parallel via Turborepo
```

API runs on `:8787`, web on `:3000`.

For the database:
```bash
cp .env.example .env
docker compose up postgres valkey -d
cd apps/api && pnpm db:generate && pnpm db:migrate
```

---

## Security Model

| Threat | Protection |
|---|---|
| Server reads your files | Files encrypted client-side; server holds ciphertext only |
| Storage provider reads your files | Encrypted blobs at rest |
| Share link intercepted in transit | Key is in URL fragment — never sent in HTTP requests |
| Share revocation | Deleting server record makes URL fragment key useless |
| Password leak | Argon2id runs client-side; server stores hash-of-hash |

See [MVP.md](./MVP.md) for known trade-offs.

---

## Roadmap

- **V2:** User-to-user sharing, Google Drive, video streaming, mobile app (React Native)
- **V3:** Proxy re-encryption, on-device ML, org accounts, IPFS

---

## Contributing

PRs welcome. See [MVP.md](./MVP.md) for what needs building.
