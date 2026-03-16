# Deployment Setup Guide

Everything you need to go from zero to a live Picturefied instance.

---

## Architecture overview

```
Browser (GitHub Pages)
  └── Vite + React SPA
        ├── Google Drive API  ←── user's own Drive (OAuth, drive.file scope)
        └── Cloudflare Worker ←── thin auth API (Hono + SuperTokens)
                                      └── SuperTokens Cloud  ←── managed auth backend
```

| Service | What it does | Cost |
|---|---|---|
| GitHub Pages | Hosts the frontend SPA | Free |
| Cloudflare Workers | Hosts the auth API | Free (100k req/day) |
| SuperTokens Cloud | Manages sessions, users | Free up to 5k MAU |
| Google Drive | Stores encrypted photos | User's own storage |

---

## What you need before starting

- [ ] GitHub account
- [ ] Google account (for OAuth client ID + Drive)
- [ ] Cloudflare account — [cloudflare.com](https://cloudflare.com) (free)
- [ ] SuperTokens account — you already have this (endpoint provided)
- [ ] Node.js 22+ and pnpm 9+ installed locally

---

## Step 1 — Fork and clone

```bash
# Fork the repo on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/picturefied
cd picturefied
pnpm install
```

---

## Step 2 — Google OAuth Client ID

The app uses Google Identity Services to let users connect their Google Drive.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project → name it **Picturefied**
3. Left sidebar → **APIs & Services → Library**
4. Search for **Google Drive API** → Enable it
5. Left sidebar → **APIs & Services → Credentials**
6. Click **+ Create Credentials → OAuth 2.0 Client ID**
7. Application type: **Web application**
8. Name: **Picturefied**
9. Authorised JavaScript origins — add both:
   ```
   http://localhost:5173
   https://YOUR_USERNAME.github.io
   ```
   _(replace YOUR_USERNAME with your GitHub username)_
10. Click **Create** → copy the **Client ID** (looks like `123456-abc.apps.googleusercontent.com`)

---

## Step 3 — SuperTokens API key

Your SuperTokens connection URI is already provisioned:
```
https://st-dev-e45f55f1-2166-11f1-a2c6-1b39c58845b4.aws.supertokens.io
```

You need the **API key** that goes with it:

1. Go to [app.supertokens.com](https://app.supertokens.com)
2. Open your dev instance → **Settings**
3. Copy the **API Key** (a long random string)
4. Keep it — you'll add it to GitHub Secrets shortly

---

## Step 4 — Cloudflare Workers setup

The auth backend runs as a Cloudflare Worker.

### 4a — Create a Cloudflare account

Go to [cloudflare.com](https://cloudflare.com) and sign up (free).

### 4b — Install Wrangler

```bash
npm install -g wrangler
wrangler login
# Opens a browser — authorise Wrangler to access your Cloudflare account
```

### 4c — Install dependencies and test the worker build

Run this from the **project root** (not from inside `worker/`). The workspace
installs everything together including the worker's deps:

```bash
# From project root:
pnpm install

# Then test the worker bundles without deploying:
cd worker
wrangler deploy --dry-run
```

You should see `Total Upload: ~2000 KiB` and `--dry-run: exiting now.` — that means it's ready.

This creates a worker named `picturefied-api` (defined in `worker/wrangler.toml`).

Note the worker URL it outputs — it looks like:
```
https://picturefied-api.YOUR_SUBDOMAIN.workers.dev
```

You'll need this URL in step 5.

### 4d — Set worker secrets

```bash
cd worker

# SuperTokens API key (from step 3)
wrangler secret put SUPERTOKENS_API_KEY
# paste the key when prompted

# JWT signing secret — generate one:
# openssl rand -hex 32
wrangler secret put JWT_SECRET
```

---

## Step 5 — GitHub repository setup

### 5a — Enable GitHub Pages

1. Go to your forked repo on GitHub
2. **Settings → Pages**
3. Source: **GitHub Actions**
4. Save

### 5b — Add GitHub secrets

Go to **Settings → Secrets and variables → Actions → Secrets → New repository secret**

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (see below) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

**Getting your Cloudflare API token:**
1. [dash.cloudflare.com](https://dash.cloudflare.com) → top right → **My Profile → API Tokens**
2. **Create Token → Edit Cloudflare Workers** template
3. Copy the token

**Getting your Cloudflare account ID:**
1. [dash.cloudflare.com](https://dash.cloudflare.com) → right sidebar shows **Account ID**

### 5c — Add GitHub variables

Go to **Settings → Secrets and variables → Actions → Variables → New repository variable**

| Variable name | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Your Google OAuth Client ID (step 2) |
| `VITE_BASE_PATH` | `/picturefied/` (or `/` if it's your user site) |
| `VITE_API_URL` | `https://picturefied-api.YOUR_SUBDOMAIN.workers.dev` |
| `VITE_PUBLIC_URL` | `https://YOUR_USERNAME.github.io` (or full URL with `/picturefied`) |

---

## Step 6 — Local development

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Google OAuth
VITE_GOOGLE_CLIENT_ID=123456-abc.apps.googleusercontent.com

# GitHub Pages base path (use / for local dev)
VITE_BASE_PATH=/

# Cloudflare Worker URL (use local dev URL below for local)
VITE_API_URL=http://localhost:8787

# SuperTokens (frontend needs the connection URI for the custom backend)
VITE_SUPERTOKENS_CONNECTION_URI=https://st-dev-e45f55f1-2166-11f1-a2c6-1b39c58845b4.aws.supertokens.io
```

Start everything locally:

```bash
# Terminal 1 — frontend
pnpm dev

# Terminal 2 — worker (auth backend)
cd worker
wrangler dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Step 7 — Deploy

Push to `main` — the GitHub Actions workflows do everything:

```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

GitHub Actions will:
1. Run all tests
2. Build the frontend (`pnpm build`)
3. Deploy frontend to GitHub Pages
4. Deploy the auth worker to Cloudflare Workers

Watch the progress under **Actions** tab on GitHub. First deploy takes ~3 minutes.

---

## Step 8 — Verify

Once deployed:

1. Open `https://YOUR_USERNAME.github.io/picturefied/`
2. Click **Get started** → Google OAuth popup should appear
3. Grant Drive access → passphrase setup screen
4. Choose a passphrase → write down the 24-word recovery phrase
5. Drag and drop a photo → it encrypts and uploads to your Drive
6. Click the photo → **Share** → create a share link
7. Open the share link in a private window → you should see the photo without logging in

---

## GitHub Secrets / Variables reference

| Name | Type | Where used |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Secret | Wrangler deploy |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Wrangler deploy |
| `VITE_GOOGLE_CLIENT_ID` | Variable | Frontend build |
| `VITE_BASE_PATH` | Variable | Frontend build |
| `VITE_API_URL` | Variable | Frontend build |
| `VITE_PUBLIC_URL` | Variable | Frontend build |

**Worker secrets** (set via `wrangler secret put`, not GitHub):

| Name | Value |
|---|---|
| `SUPERTOKENS_API_KEY` | Your SuperTokens instance API key |
| `JWT_SECRET` | Random hex string (`openssl rand -hex 32`) |

---

## Troubleshooting

**OAuth popup blocked**
→ Allow popups for your GitHub Pages domain in browser settings.

**`VITE_GOOGLE_CLIENT_ID is not set`**
→ Check that the GitHub variable is set and the workflow is using it.

**Worker returns 500**
→ Run `wrangler tail` to stream live logs from your deployed worker.

**`SUPERTOKENS_API_KEY is not set` in worker logs**
→ Run `wrangler secret put SUPERTOKENS_API_KEY` — secrets set locally don't auto-deploy.

**Photos don't appear after upload**
→ Check browser console. Usually a Drive permission or wrong `VITE_API_URL`.

**GitHub Pages shows 404 on refresh**
→ Make sure `VITE_BASE_PATH` matches your Pages URL path exactly (trailing slash matters).

---

## Production checklist

- [ ] `VITE_BASE_PATH` set to `/picturefied/` (not `/`)
- [ ] Google OAuth origins include your production Pages URL
- [ ] All GitHub secrets and variables are set
- [ ] Worker secrets set via `wrangler secret put`
- [ ] SuperTokens instance switched from dev → prod (app.supertokens.com)
- [ ] Recovery phrase written down before first use
