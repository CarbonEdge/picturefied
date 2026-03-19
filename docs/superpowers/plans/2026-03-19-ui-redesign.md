# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the frontend to be Instagram-inspired — gradient brand identity, light mode by default, sidebar on desktop / bottom tabs on mobile.

**Architecture:** Replace all dark-mode CSS tokens with light-mode defaults; add `[data-theme="dark"]` overrides. Introduce a shared `AppShell` layout component that renders a sidebar on desktop and a bottom tab bar on mobile. Wrap authenticated pages in `AppShell`; public pages get a minimal `PublicTopBar`. The upload button opens a new `UploadModal`.

**Tech Stack:** React 18, Vite, React Router (HashRouter), CSS custom properties (no Tailwind), TypeScript.

---

## File Map

**Create:**
- `src/lib/theme.ts` — read/write/apply theme from localStorage, expose `useTheme` hook
- `src/components/Layout/icons.tsx` — shared SVG icon components (no icon library)
- `src/components/Layout/PublicTopBar.tsx` — minimal top bar for unauthenticated pages
- `src/components/Upload/UploadModal.tsx` — modal (desktop) / bottom sheet (mobile) wrapping existing `Uploader`
- `src/components/Layout/Sidebar.tsx` — 72px icon sidebar for desktop
- `src/components/Layout/BottomNav.tsx` — bottom tab bar for mobile
- `src/components/Layout/AppShell.tsx` — authenticated page wrapper (sidebar + bottom nav)

**Modify:**
- `src/lib/types.ts` — add `Post` interface (shared across pages)
- `src/index.css` — new token values, gradient utilities, all component styles
- `index.html` — add inline theme-init script before React mounts (prevents FOUC)
- `src/components/Auth/SignIn.tsx` — new gradient-logo card design (keep named export)
- `src/components/Auth/UsernameRegistration.tsx` — same card design (keep named export)
- `src/components/Uploader/Uploader.tsx` — fix old purple inline rgba tint; accept `Post` from types
- `src/pages/GalleryPage.tsx` — wrap in AppShell, add profile header + tabs + photo grid
- `src/pages/FeedPage.tsx` — wrap in AppShell
- `src/pages/BrowsePage.tsx` — add PublicTopBar
- `src/pages/ProfilePage.tsx` — add PublicTopBar, styled profile header

---

## Task 1: Shared `Post` type

**Files:**
- Modify: `src/lib/types.ts`

The `Post` interface is currently duplicated inline in `GalleryPage.tsx` and `Uploader.tsx`. Extract it once here so all files import from one place.

- [ ] **Step 1: Add `Post` to `src/lib/types.ts`**

Append to the existing file (keep `FeedItem` and `FeedPage` untouched):

```ts
export interface Post {
  id: string
  driveFileId: string
  drivePublicUrl: string | null
  title: string | null
  tags: string[]
  isPublic: boolean
  createdAt: number
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**
```bash
git add src/lib/types.ts
git commit -m "feat: add Post interface to shared types"
```

---

## Task 2: CSS Tokens & Light Mode

**Files:**
- Modify: `src/index.css`
- Modify: `index.html`

- [ ] **Step 1: Rewrite `src/index.css`**

Replace the entire file with:

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ── Light mode tokens (default) ─────────────────────────────────────────── */
:root {
  --bg:           #ffffff;
  --surface:      #fafafa;
  --border:       #efefef;
  --text:         #111111;
  --muted:        #8e8e8e;
  --accent:       #9c0aa1;
  --danger:       #611717;
  --radius:       8px;
  --font:         -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --grad:         linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
  --sidebar-w:    72px;
  --bottomnav-h:  56px;
}

/* ── Dark mode tokens ─────────────────────────────────────────────────────── */
[data-theme="dark"] {
  --bg:       #0a0a0a;
  --surface:  #141414;
  --border:   #2a2a2a;
  --text:     #f0f0f0;
  --muted:    #b1a505;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:       #0a0a0a;
    --surface:  #141414;
    --border:   #2a2a2a;
    --text:     #f0f0f0;
    --muted:    #b1a505;
  }
}

/* ── Base ─────────────────────────────────────────────────────────────────── */
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.5;
  min-height: 100dvh;
}

#root { min-height: 100dvh; }

/* ── Gradient utilities ───────────────────────────────────────────────────── */
.grad-bg   { background: var(--grad); }
.grad-text {
  background: var(--grad);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.grad-border {
  border: 2px solid transparent;
  background: linear-gradient(var(--bg), var(--bg)) padding-box, var(--grad) border-box;
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */
button {
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  border: none;
  border-radius: var(--radius);
  padding: 0.6em 1.2em;
  transition: opacity 0.15s, filter 0.15s;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary { background: var(--grad); color: #fff; }
.btn-primary:hover:not(:disabled) { filter: brightness(1.08); }

.btn-ghost {
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--border);
}
.btn-ghost:hover:not(:disabled) { color: var(--text); border-color: var(--muted); }

.btn-danger { background: var(--danger); color: #fff; }

/* ── Inputs ───────────────────────────────────────────────────────────────── */
input, textarea {
  font-family: inherit;
  font-size: inherit;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.6em 0.9em;
  width: 100%;
  outline: none;
  transition: border-color 0.15s;
}
input:focus, textarea:focus { border-color: var(--accent); }
input::placeholder, textarea::placeholder { color: var(--muted); }

/* ── Links ────────────────────────────────────────────────────────────────── */
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

/* ── Utility classes ──────────────────────────────────────────────────────── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
}
.error    { color: var(--danger); font-size: 0.875rem; margin-top: 0.5rem; }
.muted    { color: var(--muted); }
.center-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 2rem;
}
.form-stack { display: flex; flex-direction: column; gap: 1rem; }
.label { display: block; font-size: 0.875rem; color: var(--muted); margin-bottom: 0.35rem; }

/* ── Auth card ────────────────────────────────────────────────────────────── */
.auth-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2.5rem 2rem;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
}
.auth-logo {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1;
}
.auth-tagline { color: var(--muted); font-size: 0.875rem; text-align: center; }
.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 0.7em 1.2em;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  transition: box-shadow 0.15s;
}
.google-btn:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }

/* ── Sidebar (desktop) ────────────────────────────────────────────────────── */
.app-shell {
  display: flex;
  min-height: 100dvh;
}
.sidebar {
  width: var(--sidebar-w);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  position: fixed;
  top: 0;
  left: 0;
  height: 100dvh;
  background: var(--bg);
  z-index: 100;
}
.sidebar-logo {
  font-size: 22px;
  font-weight: 900;
  padding: 10px;
  text-decoration: none;
}
.sidebar-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
  margin: 2px 0;
  cursor: pointer;
  border: none;
  background: transparent;
  padding: 0;
}
.sidebar-icon:hover  { background: var(--surface); color: var(--text); }
.sidebar-icon.active { background: var(--surface); color: var(--text); }
.sidebar-spacer { flex: 1; }
.sidebar-upload {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--grad);
  color: #fff;
  cursor: pointer;
  border: none;
  margin: 2px 0;
  transition: filter 0.15s;
}
.sidebar-upload:hover { filter: brightness(1.08); }
.sidebar-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  margin-top: 4px;
  background: var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  text-decoration: none;
  color: var(--muted);
  font-size: 13px;
}
.sidebar-theme {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border: none;
  margin-bottom: 4px;
  transition: background 0.15s;
}
.sidebar-theme:hover { background: var(--surface); }
.shell-main {
  margin-left: var(--sidebar-w);
  flex: 1;
  min-width: 0;
}

/* ── Bottom nav (mobile) ──────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .sidebar { display: none; }
  .shell-main { margin-left: 0; padding-bottom: var(--bottomnav-h); }

  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--bottomnav-h);
    background: var(--bg);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-around;
    z-index: 100;
  }
  .bottom-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: var(--muted);
    text-decoration: none;
    font-size: 10px;
    cursor: pointer;
    border: none;
    background: transparent;
    padding: 4px 12px;
  }
  .bottom-nav-item.active { color: var(--text); }
  .bottom-nav-upload {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--grad);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    border: none;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(188,24,136,0.35);
    margin-bottom: 8px;
  }
  .mobile-topbar {
    display: flex;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 50;
    gap: 12px;
  }
  .mobile-topbar-logo {
    font-size: 18px;
    font-weight: 900;
    flex: 1;
    text-decoration: none;
  }
}

@media (min-width: 768px) {
  .bottom-nav    { display: none; }
  .mobile-topbar { display: none; }
}

/* ── Public top bar ───────────────────────────────────────────────────────── */
.public-topbar {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 50;
}
.public-topbar-logo { font-size: 18px; font-weight: 900; text-decoration: none; }

/* ── Profile header ───────────────────────────────────────────────────────── */
.profile-section {
  padding: 24px 20px 0;
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.profile-avatar-wrap {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  padding: 2px;
  flex-shrink: 0;
  background: var(--grad);
}
.profile-avatar-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid var(--bg);
  object-fit: cover;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 24px;
  overflow: hidden;
}
.profile-info { flex: 1; min-width: 0; }
.profile-info h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 6px; }
.profile-stats { display: flex; gap: 20px; margin-bottom: 10px; }
.profile-stat { text-align: center; }
.profile-stat-num   { font-weight: 700; font-size: 0.95rem; }
.profile-stat-label { font-size: 0.72rem; color: var(--muted); }
.display-name { color: var(--muted); font-size: 0.875rem; margin-top: 4px; }
.bio          { font-size: 0.875rem; margin-top: 4px; }
.badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--grad);
  color: #fff;
  margin-top: 6px;
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
.page-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  margin-top: 16px;
  padding: 0 20px;
}
.page-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  cursor: pointer;
  border-top: none;
  border-left: none;
  border-right: none;
  background: transparent;
  font-family: inherit;
  transition: color 0.15s;
}
.page-tab:hover  { color: var(--text); }
.page-tab.active { color: var(--text); border-bottom-color: var(--text); }

/* ── Photo grid ───────────────────────────────────────────────────────────── */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 2px;
}
.photo-cell {
  aspect-ratio: 1;
  overflow: hidden;
  position: relative;
  background: var(--surface);
  cursor: pointer;
}
.photo-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity 0.15s;
}
.photo-cell:hover img { opacity: 0.85; }
.photo-cell-private {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 0.75rem;
  background: var(--surface);
}

/* ── Feed grid (browse / profile / feed pages) ────────────────────────────── */
.browse-page,
.profile-page,
.feed-page {
  max-width: 900px;
  margin: 0 auto;
  padding-bottom: 2rem;
}
.browse-page h1,
.feed-page h1 {
  font-size: 1.1rem;
  font-weight: 700;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.feed-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 2px;
}
.feed-item {
  aspect-ratio: 1;
  overflow: hidden;
  position: relative;
  background: var(--surface);
}
.feed-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity 0.15s;
}
.feed-item:hover img { opacity: 0.85; }
.feed-item-meta {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px 8px;
  background: linear-gradient(transparent, rgba(0,0,0,0.5));
  color: #fff;
  font-size: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}
.feed-item:hover .feed-item-meta { opacity: 1; }
.feed-item-meta a { color: #fff; }
.tags { display: flex; gap: 4px; flex-wrap: wrap; }

/* ── Empty state ──────────────────────────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  gap: 1rem;
  color: var(--muted);
  text-align: center;
}
.empty-state p { font-size: 0.9rem; }

/* ── Upload modal / bottom sheet ─────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}
.modal-card {
  background: var(--bg);
  border-radius: 12px;
  padding: 1.5rem;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.modal-header h3 { font-size: 1rem; font-weight: 700; }
.modal-close {
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 1.25rem;
  padding: 4px;
  line-height: 1;
  cursor: pointer;
}

@media (max-width: 767px) {
  .modal-backdrop { align-items: flex-end; padding: 0; }
  .modal-card {
    border-radius: 16px 16px 0 0;
    max-width: 100%;
    padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 2: Add theme-init script to `index.html`**

Inside `<head>`, add this block just before the closing `</head>` tag:

```html
    <script>
      (function(){
        var t = localStorage.getItem('pf_theme');
        if (t) { document.documentElement.setAttribute('data-theme', t); }
      })();
    </script>
```

- [ ] **Step 3: Typecheck**
```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add src/index.css index.html
git commit -m "feat: light-mode CSS tokens, gradient utilities, component styles"
```

---

## Task 3: Theme Hook

**Files:**
- Create: `src/lib/theme.ts`

- [ ] **Step 1: Create `src/lib/theme.ts`**

```ts
import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('pf_theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('pf_theme') as Theme | null
    if (stored) return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => { applyTheme(theme) }, [theme])

  function toggle() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  return { theme, toggle }
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**
```bash
git add src/lib/theme.ts
git commit -m "feat: useTheme hook for light/dark toggle"
```

---

## Task 4: Shared Icon Components

**Files:**
- Create: `src/components/Layout/icons.tsx`

These are used by both `Sidebar` and `BottomNav`. Defined once here to avoid duplication.

- [ ] **Step 1: Create `src/components/Layout/icons.tsx`**

```tsx
export function IconGrid({ active = false }: { active?: boolean }) {
  if (active) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.8">
        <defs>
          <linearGradient id="grad-icon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f09433"/>
            <stop offset="100%" stopColor="#bc1888"/>
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="7" height="7" rx="1" stroke="url(#grad-icon)"/>
        <rect x="14" y="3" width="7" height="7" rx="1" stroke="url(#grad-icon)"/>
        <rect x="3" y="14" width="7" height="7" rx="1" stroke="url(#grad-icon)"/>
        <rect x="14" y="14" width="7" height="7" rx="1" stroke="url(#grad-icon)"/>
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}

export function IconSearch() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

export function IconFeed() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

export function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

export function IconPerson() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

export function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

export function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**
```bash
git add src/components/Layout/icons.tsx
git commit -m "feat: shared SVG icon components for nav"
```

---

## Task 5: UploadModal

**Files:**
- Create: `src/components/Upload/UploadModal.tsx`
- Modify: `src/components/Uploader/Uploader.tsx`

This task creates `UploadModal` **before** `AppShell` (Task 6) so AppShell can import it without a missing-module error.

- [ ] **Step 1: Fix old purple tint in `src/components/Uploader/Uploader.tsx`**

Find this line (the drag-hover background):
```tsx
background: dragging ? 'rgba(124,106,245,0.05)' : 'transparent',
```
Replace with:
```tsx
background: dragging ? 'rgba(156,10,161,0.05)' : 'transparent',
```

Also update the `Post` interface at the top of the file to import from shared types instead of redeclaring it:

Remove the local `interface Post { ... }` block (lines 7–15 approx) and add at the top:
```tsx
import type { Post } from '../../lib/types'
```

- [ ] **Step 2: Create `src/components/Upload/UploadModal.tsx`**

```tsx
import type { Post } from '../../lib/types'
import Uploader from '../Uploader/Uploader'

interface UploadModalProps {
  onClose: () => void
  onUploaded: (post: Post) => void
}

export default function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h3>New Post</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <Uploader onUploaded={onUploaded} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**
```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add src/components/Upload/UploadModal.tsx src/components/Uploader/Uploader.tsx
git commit -m "feat: UploadModal; fix old purple accent tint; use shared Post type in Uploader"
```

---

## Task 6: Sidebar, BottomNav, AppShell

**Files:**
- Create: `src/components/Layout/Sidebar.tsx`
- Create: `src/components/Layout/BottomNav.tsx`
- Create: `src/components/Layout/AppShell.tsx`

`UploadModal` (Task 5) must be complete before this task.

- [ ] **Step 1: Create `src/components/Layout/Sidebar.tsx`**

```tsx
import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../../lib/theme'
import { getStoredUser } from '../../lib/session'
import { IconGrid, IconSearch, IconFeed, IconPlus, IconSun, IconMoon } from './icons'

interface SidebarProps {
  onUpload: () => void
}

export default function Sidebar({ onUpload }: SidebarProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const user = getStoredUser()

  return (
    <nav className="sidebar">
      <a href="#/gallery" className="sidebar-logo grad-text">P</a>

      <button
        className={`sidebar-icon${pathname === '/gallery' ? ' active' : ''}`}
        onClick={() => navigate('/gallery')}
        title="Gallery"
      >
        <IconGrid active={pathname === '/gallery'} />
      </button>

      <button
        className={`sidebar-icon${pathname.startsWith('/browse') ? ' active' : ''}`}
        onClick={() => navigate('/browse/trending')}
        title="Browse"
      >
        <IconSearch />
      </button>

      <button
        className={`sidebar-icon${pathname === '/feed' ? ' active' : ''}`}
        onClick={() => navigate('/feed')}
        title="Following"
      >
        <IconFeed />
      </button>

      <div className="sidebar-spacer" />

      <button className="sidebar-upload" onClick={onUpload} title="New post">
        <IconPlus />
      </button>

      {user && (
        <a
          href={`#/u/${user.username}`}
          className="sidebar-avatar"
          title={`@${user.username}`}
        >
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : user.username[0]?.toUpperCase()
          }
        </a>
      )}

      <button className="sidebar-theme" onClick={toggle} title="Toggle theme">
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
    </nav>
  )
}
```

- [ ] **Step 2: Create `src/components/Layout/BottomNav.tsx`**

```tsx
import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../../lib/theme'
import { getStoredUser } from '../../lib/session'
import { IconGrid, IconSearch, IconPlus, IconPerson, IconSun, IconMoon } from './icons'

interface BottomNavProps {
  onUpload: () => void
}

export default function BottomNav({ onUpload }: BottomNavProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const user = getStoredUser()

  return (
    <>
      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <a href="#/gallery" className="mobile-topbar-logo grad-text">Picturefied</a>
        <button className="sidebar-theme" onClick={toggle} style={{ marginRight: 4 }}>
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        {user && (
          <a href={`#/u/${user.username}`} className="sidebar-avatar">
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : user.username[0]?.toUpperCase()
            }
          </a>
        )}
      </div>

      {/* Bottom tabs */}
      <nav className="bottom-nav">
        <button
          className={`bottom-nav-item${pathname === '/gallery' ? ' active' : ''}`}
          onClick={() => navigate('/gallery')}
        >
          <IconGrid active={pathname === '/gallery'} />
          <span>Gallery</span>
        </button>

        <button
          className={`bottom-nav-item${pathname.startsWith('/browse') ? ' active' : ''}`}
          onClick={() => navigate('/browse/trending')}
        >
          <IconSearch />
          <span>Search</span>
        </button>

        <button className="bottom-nav-upload" onClick={onUpload}>
          <IconPlus />
        </button>

        <button
          className={`bottom-nav-item${pathname === '/feed' ? ' active' : ''}`}
          onClick={() => navigate('/feed')}
        >
          <IconPerson />
          <span>Feed</span>
        </button>
      </nav>
    </>
  )
}
```

- [ ] **Step 3: Create `src/components/Layout/AppShell.tsx`**

```tsx
import { useState } from 'react'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import UploadModal from '../Upload/UploadModal'
import type { Post } from '../../lib/types'

interface AppShellProps {
  children: React.ReactNode
  onPostUploaded?: (post: Post) => void
}

export default function AppShell({ children, onPostUploaded }: AppShellProps) {
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <div className="app-shell">
      <Sidebar onUpload={() => setUploadOpen(true)} />
      <BottomNav onUpload={() => setUploadOpen(true)} />
      <main className="shell-main">
        {children}
      </main>
      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={(post) => {
            setUploadOpen(false)
            onPostUploaded?.(post)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**
```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 5: Commit**
```bash
git add src/components/Layout/
git commit -m "feat: Sidebar, BottomNav, AppShell layout components"
```

---

## Task 7: PublicTopBar

**Files:**
- Create: `src/components/Layout/PublicTopBar.tsx`

- [ ] **Step 1: Create `src/components/Layout/PublicTopBar.tsx`**

```tsx
import { useTheme } from '../../lib/theme'
import { IconSun, IconMoon } from './icons'

export default function PublicTopBar() {
  const { theme, toggle } = useTheme()
  return (
    <div className="public-topbar">
      <a href="#/" className="public-topbar-logo grad-text">Picturefied</a>
      <div style={{ flex: 1 }} />
      <button className="sidebar-theme" onClick={toggle}>
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**
```bash
git add src/components/Layout/PublicTopBar.tsx
git commit -m "feat: PublicTopBar for unauthenticated pages"
```

---

## Task 8: Auth Page Redesign

**Files:**
- Modify: `src/components/Auth/SignIn.tsx`
- Modify: `src/components/Auth/UsernameRegistration.tsx`

Both use **named exports** (`export function ...`). Keep them named — `AuthPage.tsx` imports them as `{ SignIn }` and `{ UsernameRegistration }`.

- [ ] **Step 1: Rewrite `src/components/Auth/SignIn.tsx`**

All auth logic is preserved; only the returned JSX changes. Keep named export:

```tsx
import { useEffect, useRef } from 'react'
import {
  loadGoogleIdentityServices,
  initializeGoogleSignIn,
  renderSignInButton,
} from '../../lib/auth'
import { exchangeGoogleToken, saveSession } from '../../lib/session'
import type { StoredUser } from '../../lib/session'

const GOOGLE_CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string
const API_URL = import.meta.env['VITE_API_URL'] as string

interface SignInProps {
  onSuccess: (user: StoredUser, isNewUser: boolean) => void
  onError?: (error: Error) => void
}

export function SignIn({ onSuccess, onError }: SignInProps) {
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    loadGoogleIdentityServices()
      .then(() => {
        if (!mounted) return
        initializeGoogleSignIn(GOOGLE_CLIENT_ID, async (credential) => {
          try {
            const result = await exchangeGoogleToken(credential, API_URL)
            saveSession(result.sessionToken, result.user)
            onSuccess(result.user, result.isNewUser)
          } catch (err) {
            onError?.(err instanceof Error ? err : new Error(String(err)))
          }
        })
        if (buttonRef.current) renderSignInButton(buttonRef.current)
      })
      .catch((err: unknown) => {
        onError?.(err instanceof Error ? err : new Error(String(err)))
      })
    return () => { mounted = false }
  }, [onSuccess, onError])

  return (
    <div className="center-page">
      <div className="auth-card">
        <div className="auth-logo grad-text">Picturefied</div>
        <p className="auth-tagline">Share your world. Keep what's yours.</p>
        <div style={{ width: '100%', height: 1, background: 'var(--border)' }} />
        <div ref={buttonRef} style={{ width: '100%' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `src/components/Auth/UsernameRegistration.tsx`**

All form logic is preserved (state, validation regex, `handleSubmit`, `autoFocus`, `minLength`/`maxLength`, `type="submit"`). Only the returned JSX wrapper changes. Keep named export:

```tsx
import { useState } from 'react'
import { getSessionToken } from '../../lib/session'
import type { StoredUser } from '../../lib/session'

const API_URL = import.meta.env['VITE_API_URL'] as string

const USERNAME_RE = /^[a-z0-9_]{3,30}$/

interface UsernameRegistrationProps {
  onSuccess: (user: StoredUser) => void
  onError?: (error: Error) => void
}

export function UsernameRegistration({ onSuccess, onError }: UsernameRegistrationProps) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isValid = USERNAME_RE.test(username)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) {
      setError('3-30 chars: lowercase letters, numbers, underscores only')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = getSessionToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`${API_URL}/users/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      })

      if (!response.ok) {
        const err = (await response.json()) as { error: string }
        throw new Error(err.error ?? 'Failed to register username')
      }

      const user = (await response.json()) as StoredUser
      onSuccess(user)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e.message)
      onError?.(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="center-page">
      <div className="auth-card">
        <div className="auth-logo grad-text">Picturefied</div>
        <p className="auth-tagline">One last step — choose your username.</p>
        <form onSubmit={handleSubmit} className="form-stack" style={{ width: '100%' }}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="username"
            minLength={3}
            maxLength={30}
            required
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading || !isValid}>
            {loading ? 'Setting up…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**
```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**
```bash
git add src/components/Auth/
git commit -m "feat: redesign auth card with gradient logo"
```

---

## Task 9: Gallery Page

**Files:**
- Modify: `src/pages/GalleryPage.tsx`

- [ ] **Step 1: Rewrite `src/pages/GalleryPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/Layout/AppShell'
import { getSessionToken, clearSession, getStoredUser } from '../lib/session'
import type { Post } from '../lib/types'

const API_URL = import.meta.env['VITE_API_URL'] as string

export default function GalleryPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const user = getStoredUser()

  useEffect(() => {
    const token = getSessionToken()
    if (!token) return
    fetch(`${API_URL}/posts/mine`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { posts: Post[] }) => {
        setPosts(data.posts)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function handleUploaded(post: Post) {
    setPosts((prev) => [post, ...prev])
  }

  function logout() {
    clearSession()
    navigate('/', { replace: true })
  }

  return (
    <AppShell onPostUploaded={handleUploaded}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Profile header */}
        <div className="profile-section">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar-inner">
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '👤'
              }
            </div>
          </div>
          <div className="profile-info">
            <h2>@{user?.username ?? '…'}</h2>
            <div className="profile-stats">
              <div className="profile-stat">
                <div className="profile-stat-num">{posts.length}</div>
                <div className="profile-stat-label">posts</div>
              </div>
            </div>
            <button className="btn-ghost" style={{ fontSize: '0.8rem', marginTop: 4 }} onClick={logout}>
              Sign out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="page-tabs">
          <button className="page-tab active">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            My Posts
          </button>
          <button className="page-tab" onClick={() => navigate('/feed')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
            </svg>
            Feed
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <p className="muted" style={{ textAlign: 'center', padding: '3rem' }}>Loading…</p>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <p>No posts yet.</p>
            <p style={{ fontSize: '0.8rem' }}>Tap the + button to share your first photo.</p>
          </div>
        ) : (
          <div className="photo-grid">
            {posts.map((post) => (
              <div key={post.id} className="photo-cell">
                {post.drivePublicUrl
                  ? <img src={post.drivePublicUrl} alt={post.title ?? ''} loading="lazy" />
                  : <div className="photo-cell-private">Private</div>
                }
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**
```bash
git add src/pages/GalleryPage.tsx
git commit -m "feat: gallery page with profile header, tabs, photo grid, AppShell"
```

---

## Task 10: Feed, Browse & Profile Pages

**Files:**
- Modify: `src/pages/FeedPage.tsx`
- Modify: `src/pages/BrowsePage.tsx`
- Modify: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: Wrap FeedPage in AppShell**

In `src/pages/FeedPage.tsx`:

1. Add import: `import AppShell from '../components/Layout/AppShell'`
2. The file has **four early-return guards before the main return** (lines 27–31 in the original):
   - `if (!authed) return <Navigate to="/auth" replace />`
   - `if (loading) return <div>Loading…</div>`
   - `if (error) return <div>Error: {error}</div>`
   - `if (!feed) return null`

   **Leave all four guards exactly as-is.** Only the final `return` gets wrapped in AppShell:

```tsx
return (
  <AppShell>
    <div className="feed-page">
      <h1>Following</h1>
      {feed.items.length === 0 ? (
        <p style={{ padding: '2rem 20px', color: 'var(--muted)' }}>
          Follow people to see their posts here.
        </p>
      ) : (
        <div className="feed-grid">
          {feed.items.map((item) => (
            <div key={item.postId} className="feed-item">
              <img src={item.drivePublicUrl} alt={item.title ?? ''} loading="lazy" />
              <div className="feed-item-meta">
                <a href={`#/u/${item.authorUsername}`}>@{item.authorUsername}</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </AppShell>
)
```

- [ ] **Step 2: Add PublicTopBar to BrowsePage**

In `src/pages/BrowsePage.tsx`:

1. Add import: `import PublicTopBar from '../components/Layout/PublicTopBar'`
2. Wrap returned JSX:

```tsx
return (
  <div className="browse-page">
    <PublicTopBar />
    <h1>#{tag}</h1>
    {feed.items.length === 0 ? (
      <p style={{ padding: '2rem 20px', color: 'var(--muted)' }}>No posts yet for #{tag}</p>
    ) : (
      <div className="feed-grid">
        {feed.items.map((item) => (
          <div key={item.postId} className="feed-item">
            <img src={item.drivePublicUrl} alt={item.title ?? `#${tag}`} loading="lazy" />
            <div className="feed-item-meta">
              <a href={`#/u/${item.authorUsername}`}>@{item.authorUsername}</a>
              <div className="tags">
                {item.tags.map((t) => (
                  <a key={t} href={`#/browse/${t}`}>#{t}</a>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)
```

The three early-return guards (`loading`, `error`, `!feed`) remain unchanged before this final return.

- [ ] **Step 3: Add PublicTopBar and profile-section to ProfilePage**

In `src/pages/ProfilePage.tsx`:

1. Add import: `import PublicTopBar from '../components/Layout/PublicTopBar'`
2. Replace the entire component return (keeping the three early-return guards for `loading`, `error`, `!profile` unchanged):

```tsx
return (
  <div className="profile-page">
    <PublicTopBar />
    <div className="profile-section">
      <div className="profile-avatar-wrap">
        <div className="profile-avatar-inner">
          {profile.avatarUrl
            ? <img src={profile.avatarUrl} alt={profile.displayName ?? profile.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : '👤'
          }
        </div>
      </div>
      <div className="profile-info">
        <h2>@{profile.username}</h2>
        {profile.displayName && <p className="display-name">{profile.displayName}</p>}
        {profile.bio && <p className="bio">{profile.bio}</p>}
        {profile.accountType === 'ai' && <span className="badge">AI</span>}
      </div>
    </div>

    {feed && feed.items.length > 0 ? (
      <div className="feed-grid">
        {feed.items.map((item) => (
          <div key={item.postId} className="feed-item">
            <a href={`#/browse/${item.tags[0] ?? ''}`}>
              <img src={item.drivePublicUrl} alt={item.title ?? ''} loading="lazy" />
            </a>
          </div>
        ))}
      </div>
    ) : (
      <p style={{ padding: '2rem 20px', color: 'var(--muted)' }}>No posts yet.</p>
    )}
  </div>
)
```

- [ ] **Step 4: Typecheck**
```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 5: Commit**
```bash
git add src/pages/FeedPage.tsx src/pages/BrowsePage.tsx src/pages/ProfilePage.tsx
git commit -m "feat: AppShell/PublicTopBar on feed/browse/profile pages"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Full typecheck (frontend + worker)**
```bash
pnpm typecheck && cd worker && pnpm typecheck && cd ..
```
Expected: both clean.

- [ ] **Step 2: Run all tests**
```bash
pnpm test
```
Expected: all pass (no business logic changed).

- [ ] **Step 3: Visual smoke test**

Open `http://localhost:5173` and verify:
- [ ] White background by default (light mode)
- [ ] Gradient "Picturefied" logo on sign-in screen
- [ ] Sidebar visible when browser ≥ 768px wide
- [ ] Bottom tab bar + mobile top bar visible when browser < 768px
- [ ] Dark mode toggle (sun/moon) works and persists on refresh
- [ ] Clicking "+" opens UploadModal
- [ ] Gallery grid shows 3 columns with 2px gaps

- [ ] **Step 4: Final commit**
```bash
git add -A
git commit -m "feat: complete UI redesign — Instagram-style, light mode, gradient branding"
```
