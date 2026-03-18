# Deployment Setup Guide

Everything you need to go from zero to a live Picturefied instance.

---

## Services required

| Service | Purpose | Cost |
|---|---|---|
| Google Cloud | OAuth 2.0 + Drive API | Free tier |
| Cloudflare Workers | Social API | Free tier |
| Cloudflare D1 | Social graph (users, posts, follows) | Free tier |
| Cloudflare KV | Sessions, tag indices, feed cache | Free tier |
| GitHub Pages | Static frontend hosting | Free |

---

## Google Cloud

### 1. Create a project

1. [console.cloud.google.com](https://console.cloud.google.com) → New Project

### 2. Enable APIs

- **Google Drive API**
- No additional APIs needed (Sign-In uses the OAuth endpoint directly)

### 3. OAuth consent screen

- User type: External
- Add scopes: `../auth/drive.file`
- Add test users while in development

### 4. OAuth 2.0 Credentials

- Application type: **Web application**
- Authorised JavaScript origins:
  ```
  http://localhost:5173
  https://yourusername.github.io
  ```
- Copy the **Client ID** — used in both `.env` and `wrangler.toml`

---

## Cloudflare

### 1. D1 Database

```bash
cd worker
npx wrangler d1 create picturefied
```

Copy the `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "picturefied"
database_id = "YOUR_DATABASE_ID"
```

Apply the schema:

```bash
# Local dev
npx wrangler d1 execute picturefied --local --file=src/db/schema.sql

# Production
npx wrangler d1 execute picturefied --remote --file=src/db/schema.sql
```

### 2. KV Namespaces

```bash
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create TAG_INDEX
npx wrangler kv namespace create FEED_CACHE
```

Copy the IDs into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_SESSIONS_ID"

[[kv_namespaces]]
binding = "TAG_INDEX"
id = "YOUR_TAG_INDEX_ID"

[[kv_namespaces]]
binding = "FEED_CACHE"
id = "YOUR_FEED_CACHE_ID"
```

### 3. Secrets

```bash
npx wrangler secret put JWT_SECRET
# Enter any random 32+ char string (used for HMAC API key hashing)
```

### 4. Worker vars

In `wrangler.toml`:

```toml
[vars]
APP_NAME = "Picturefied"
API_DOMAIN = "https://picturefied-api.YOUR_SUBDOMAIN.workers.dev"
WEBSITE_DOMAIN = "https://yourusername.github.io"
GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID"
```

### 5. Deploy

```bash
cd worker && pnpm deploy
```

---

## GitHub Pages (frontend)

### 1. Enable GitHub Pages

Repository → Settings → Pages → Source: **GitHub Actions**

### 2. Set repository variables

Settings → Secrets and variables → Actions → Variables:

| Variable | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Your Google Client ID |
| `VITE_API_URL` | Your worker URL |
| `VITE_BASE_PATH` | `/picturefied/` (or `/` for user sites) |

### 3. Deploy

Push to `main`. The `deploy.yml` workflow builds and deploys to Pages.

---

## Local dev checklist

- [ ] `.env` has `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL=http://localhost:8787`
- [ ] `wrangler.toml` has D1 `database_id` and KV `id` values filled in
- [ ] `wrangler.toml` has `GOOGLE_CLIENT_ID` set
- [ ] `JWT_SECRET` secret is set (any value works locally, wrangler uses it via dev)
- [ ] Schema applied: `npx wrangler d1 execute picturefied --local --file=src/db/schema.sql`
- [ ] Worker running: `cd worker && pnpm dev`
- [ ] Frontend running: `pnpm dev`

---

## Production checklist

- [ ] D1 schema applied to remote database
- [ ] All KV namespace IDs set in `wrangler.toml`
- [ ] `JWT_SECRET` set via `wrangler secret put`
- [ ] Worker deployed: `cd worker && pnpm deploy`
- [ ] `API_DOMAIN` and `WEBSITE_DOMAIN` updated in `wrangler.toml`
- [ ] GitHub Actions variables set
- [ ] Frontend deployed via push to `main`
