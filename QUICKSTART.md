# Quick Start

Get Picturefied running locally in under 5 minutes.

---

## How it works

Picturefied is a **static web app** (no backend). All your photos are:

1. **Encrypted on your device** before leaving your browser
2. **Stored in your own Google Drive** — Picturefied never touches your files
3. **Decryptable only with your passphrase** — we can't read them even if we wanted to

The only "server" is GitHub Pages serving the HTML/JS. No databases, no auth services, no infrastructure costs.

---

## Prerequisites

- [Node.js 22+](https://nodejs.org)
- [pnpm 9+](https://pnpm.io/installation) — `npm install -g pnpm`
- A Google account (for Google Drive storage)
- A Google Cloud project with the Drive API enabled (see below)

---

## 1. Set up Google OAuth

You need a Google OAuth client ID so the app can request Drive access.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Drive API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorised JavaScript origins: `http://localhost:5173` (for local dev)
   - For production add your GitHub Pages URL, e.g. `https://yourusername.github.io`
7. Copy the **Client ID** — you'll need it in step 2

---

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Your Google OAuth Client ID from step 1
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com

# Base path for GitHub Pages — '/' for user sites, '/picturefied/' for project sites
VITE_BASE_PATH=/
```

---

## 3. Install dependencies

```bash
git clone https://github.com/yourusername/picturefied
cd picturefied
pnpm install
```

---

## 4. Run locally

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## 5. First-time setup

1. Click **Connect Google Drive** — a Google OAuth popup appears
2. Grant the app access to your Drive files (**only files it creates** — `drive.file` scope)
3. Choose a passphrase (12+ characters)
4. Write down your **24-word recovery phrase** — the only way to recover your account
5. Confirm one word from your phrase
6. You're in

---

## 6. Upload a photo

Drag and drop a photo onto the upload zone. Watch the status bar:

```
vacation.jpg   Encrypting…
vacation.jpg   Uploading…
vacation.jpg   Done
```

The file is encrypted on your device before upload. Google Drive receives ciphertext only.

---

## 7. Share a photo

1. Hover over a photo → click **Share**
2. Set an optional expiry
3. Click **Create share link**
4. Copy the link — it looks like:

```
https://yourusername.github.io/picturefied/#/s?t=abc123&k=base64urlkey&d=driveUrl
```

The `k=` parameter is the decryption key — it's in the URL **fragment** (after `#`), so it's never sent to any server. Send the full URL to your recipient — they can view the photo without an account.

To revoke: go to your shares list and click **Revoke**.

---

## Run tests

```bash
pnpm test
```

Watch mode:

```bash
pnpm test:watch
```

Coverage:

```bash
pnpm test:coverage
```

---

## Deploy to GitHub Pages

### First time

1. Fork this repo on GitHub
2. Go to **Settings → Pages → Source** → select **GitHub Actions**
3. Go to **Settings → Variables → Actions** and add:
   - `VITE_GOOGLE_CLIENT_ID` — your Google OAuth client ID
   - `VITE_BASE_PATH` — `/picturefied/` (for project sites) or `/` (for user sites)
4. Push to `main` — the GitHub Actions workflow builds and deploys automatically

### Every push

Every push to `main` runs tests, then deploys. Takes ~2 minutes.

---

## Project layout

```
picturefied/
├── src/
│   ├── lib/
│   │   ├── crypto/       libsodium wrapper (key derivation, file encrypt/decrypt)
│   │   ├── storage/
│   │   │   └── gdrive.ts Google Drive adapter (OAuth, upload, download)
│   │   ├── index-manager.ts  Encrypted index — replaces the database
│   │   ├── keystore.ts   In-memory Zustand keystore (keys never persisted)
│   │   └── crypto-worker.ts  Promise wrapper for the Web Worker
│   ├── workers/
│   │   └── crypto.worker.ts  Heavy crypto off the main thread
│   ├── components/
│   │   ├── Setup/        First-time setup flow
│   │   ├── Unlock/       Return-visit unlock flow
│   │   ├── Gallery/      Photo grid + viewer
│   │   ├── Uploader/     Drag-drop upload with encryption
│   │   └── Share/        Share modal + public viewer
│   ├── pages/            Route-level page components
│   └── __tests__/        Vitest test suite
├── .github/workflows/    GitHub Actions CI/CD
├── vite.config.ts        Vite + Vitest config
└── QUICKSTART.md         This file
```

---

## What lives where

| Data | Location |
|---|---|
| Your photos (encrypted) | `picturefied/files/*.enc` in your Drive |
| Thumbnails (encrypted) | `picturefied/thumbs/*.enc` in your Drive |
| File index (encrypted) | `picturefied/index.enc` in your Drive |
| Your keypair (encrypted) | `picturefied/config.enc` in your Drive |
| Share payloads | `picturefied/shared/*.enc` in your Drive |
| Source code | GitHub (public) |
| Your passphrase | Nowhere — never stored |
| Your encryption keys | Browser memory only — cleared on page close |

---

## Security model

- **Zero-knowledge**: Picturefied (the static site) never sees your passphrase or keys
- **Argon2id**: Key derivation is slow by design (~2-3 seconds) — brute-force resistant
- **XChaCha20-Poly1305**: File encryption with authentication — tampering is detected
- **X25519**: FEK wrapping — only your private key can unwrap file keys
- **URL fragments**: Share keys live in `#fragment` — browsers never send them to servers
- **`drive.file` scope**: The app can only access files it creates — not your other Drive data

---

## Troubleshooting

**OAuth popup blocked**
→ Allow popups for `localhost:5173` in your browser settings.

**"VITE_GOOGLE_CLIENT_ID is not set"**
→ Copy `.env.example` to `.env` and set your client ID.

**Argon2id is slow on first unlock (~2-3 seconds)**
→ This is intentional. Key derivation is designed to be expensive.

**Recovery phrase warning**
→ Do not skip this step. If you forget your passphrase and don't have the phrase, your encrypted files are permanently unrecoverable.

**Tests fail with module errors**
→ Run `pnpm install` first. The crypto library requires libsodium which must be installed.
