# Quick Start

Get Picturefied running locally in under 5 minutes.

---

## Prerequisites

- Node.js ≥ 22, pnpm ≥ 9
- A Google Cloud project (free)
- A Cloudflare account (free)

---

## 1. Google Cloud setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** → Web application
3. Add authorised JavaScript origins:
   - `http://localhost:5173` (local dev)
   - `https://yourusername.github.io` (production)
4. Enable the **Google Drive API** for the same project
5. Copy the **Client ID**

---

## 2. Clone and configure

```bash
git clone https://github.com/yourusername/picturefied.git
cd picturefied
pnpm install

cp .env.example .env
# Edit .env — set VITE_GOOGLE_CLIENT_ID to your Client ID
```

---

## 3. Cloudflare Worker setup

```bash
cd worker

# Login
npx wrangler login

# Create D1 database
npx wrangler d1 create picturefied
# → Copy database_id into wrangler.toml [[d1_databases]]

# Create KV namespaces
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create TAG_INDEX
npx wrangler kv namespace create FEED_CACHE
# → Copy each id into wrangler.toml [[kv_namespaces]]

# Apply schema
npx wrangler d1 execute picturefied --local --file=src/db/schema.sql

# Set secrets
npx wrangler secret put JWT_SECRET    # any random 32+ char string

# Set GOOGLE_CLIENT_ID in wrangler.toml [vars]
```

---

## 4. Run locally

```bash
# Terminal 1 — Worker (http://localhost:8787)
cd worker && pnpm dev

# Terminal 2 — Frontend (http://localhost:5173)
pnpm dev
```

Open `http://localhost:5173` → **Sign in with Google** → choose a username → done.

---

## 5. Deploy

### Worker

```bash
cd worker && pnpm deploy
# Update wrangler.toml API_DOMAIN to your workers.dev URL
```

### Frontend (GitHub Pages)

Push to `main`. The CI workflow builds and deploys automatically.

Set these GitHub Actions variables:
- `VITE_GOOGLE_CLIENT_ID` — your Client ID
- `VITE_API_URL` — your worker URL

---

## Auth flow

```
1. Sign in with Google → Google issues ID token (JWT)
2. Frontend POSTs token to Worker /auth/google
   → Worker verifies against Google JWKS
   → Worker upserts user in D1
   → Worker issues session token → KV (24h TTL)
3a. Existing user → unlock (if private mode) → gallery
3b. New user     → choose username → connect Drive → done
```

## Private mode (optional)

Private mode adds E2E encryption on top of the social layer. During setup,
choose a passphrase — a BIP39 recovery phrase is shown. Files are encrypted
with libsodium before upload. Keys live in memory only; refreshing the page
requires re-unlocking.
