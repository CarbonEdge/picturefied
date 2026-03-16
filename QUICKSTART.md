# Quick Start

Get Picturefied running locally in under 5 minutes.

---

## Prerequisites

- [Node.js 22+](https://nodejs.org)
- [pnpm 9+](https://pnpm.io/installation) — `npm install -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Postgres + Valkey)

---

## 1. Install dependencies

```bash
git clone https://github.com/picturefied/picturefied
cd picturefied
pnpm install
```

---

## 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set the two required values:

```env
# Generate with: openssl rand -hex 64
JWT_SECRET=your_64_byte_hex_secret_here

# Your domain (use localhost for local dev)
DOMAIN=localhost
PUBLIC_URL=http://localhost:3000
```

Everything else has working defaults for local development.

---

## 3. Start the database

```bash
docker compose up postgres valkey -d
```

Wait a few seconds for Postgres to be ready, then run migrations:

```bash
pnpm --filter @picturefied/api db:generate
pnpm --filter @picturefied/api db:migrate
```

---

## 4. Start the apps

```bash
pnpm dev
```

This starts both the API and web app in parallel via Turborepo.

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:8787 |
| API health | http://localhost:8787/health |

---

## 5. Create your account

1. Open http://localhost:3000
2. Click **Create account**
3. Choose a handle and password (12+ characters)
4. **Write down your 24-word recovery phrase** — this is the only way to recover your account if you forget your password
5. Confirm one word from your phrase to continue
6. You're in

---

## 6. Upload a photo

Drag and drop a photo onto the upload zone. Watch the status bar — it shows:

```
vacation.jpg   Encrypting…  ████░░░░  40%
vacation.jpg   Uploading…   ████████  80%
vacation.jpg   Done
```

The file is encrypted on your device before it leaves the browser. The server receives ciphertext only.

---

## 7. Share a photo

1. Click any photo in your gallery
2. Click **Share**
3. Set an optional expiry
4. Click **Create share link**
5. Copy the link — it looks like:

```
http://localhost:3000/s/abc123token#base64urlkey
```

The part after `#` is the decryption key. It never leaves your browser. Send the full URL to your recipient — they can view the photo without an account.

To revoke: go to your shares list and click **Revoke**.

---

## Run tests

```bash
pnpm test
```

Run a single package's tests:

```bash
pnpm --filter @picturefied/crypto test
pnpm --filter @picturefied/storage test
pnpm --filter @picturefied/api test
pnpm --filter @picturefied/web test
```

Watch mode:

```bash
pnpm test:watch
```

Coverage report:

```bash
pnpm test:coverage
```

---

## Self-host with Docker (production)

> Requires a domain with DNS pointing at your server.

```bash
# On your server
git clone https://github.com/picturefied/picturefied
cd picturefied
cp .env.example .env
```

Edit `.env`:

```env
JWT_SECRET=<openssl rand -hex 64>
DOMAIN=photos.yourdomain.com
PUBLIC_URL=https://photos.yourdomain.com

# For production, use S3-compatible storage instead of local
STORAGE_BACKEND=s3
S3_BUCKET=your-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Deploy:

```bash
docker compose up -d
```

Caddy handles TLS automatically via Let's Encrypt. First startup takes ~30 seconds to issue the certificate.

---

## Storage backends

| Backend | When to use | Config |
|---|---|---|
| `local` | Dev / single-server self-hosted | `STORAGE_ROOT=/data/files` |
| `s3` | Production / multi-user | See `.env.example` S3 section |

S3-compatible services that work out of the box: **AWS S3**, **Cloudflare R2** (free egress), **MinIO** (self-hosted), **Backblaze B2**, **Wasabi**.

---

## Troubleshooting

**`JWT_SECRET is required` on startup**
→ Make sure you've copied `.env.example` to `.env` and set `JWT_SECRET`.

**`STORAGE_ROOT is not accessible`**
→ Create the directory: `mkdir -p ./data/files`

**Argon2id is slow on first login (~2-3 seconds)**
→ This is intentional. Key derivation is designed to be expensive. It runs once per login on the client.

**Recovery phrase warning at registration**
→ Do not skip this step. If you lose your password and don't have the phrase, your encrypted files are permanently unrecoverable. Write it on paper.

**Tests fail with `Cannot find module`**
→ Run `pnpm build` first — packages need to be compiled before tests can import them.

---

## Project layout

```
picturefied/
├── packages/
│   ├── crypto/     Core encryption primitives (libsodium)
│   └── storage/    Pluggable storage backends
├── apps/
│   ├── api/        REST API (Hono.js + PostgreSQL)
│   └── web/        Frontend (Next.js 15)
├── MVP.md          Full architecture specification
└── QUICKSTART.md   This file
```

---

## What's next

See [MVP.md](./MVP.md) for the full architecture, security model, and roadmap.
