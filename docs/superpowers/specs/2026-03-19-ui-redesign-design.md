# UI Redesign — Design Spec
**Date:** 2026-03-19
**Status:** Approved by user

---

## Overview

Redesign Picturefied's frontend UI to be Instagram-inspired: light mode by default, friendly and approachable, with gradient brand identity. The app is a social meme/photo platform — the UI should feel familiar to anyone who's used Instagram.

---

## Visual Identity

**Brand gradient:** `linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)`
Used on: logo text, active nav icons, upload button, avatar ring, primary CTA buttons.

**Color tokens (light mode defaults):**
```
--bg:           #ffffff
--surface:      #fafafa
--border:       #efefef
--text:         #111111
--muted:        #8e8e8e
--accent:       #bc1888      (end of gradient — single solid for focus rings etc.)
--danger:       #e05a5a
--radius:       8px
```

**Dark mode** (opt-in via `prefers-color-scheme: dark` + manual toggle stored in localStorage):
```
--bg:           #0a0a0a
--surface:      #141414
--border:       #2a2a2a
--text:         #f0f0f0
--muted:        #888888
```

**Typography:** System font stack. Base 15px. Logo uses `font-weight: 800`.

---

## Layout

### Desktop (≥ 768px) — Icon Sidebar

```
┌──────┬────────────────────────────────────┐
│  72px│         Main content area          │
│      │                                    │
│  [P] │  Profile header / feed / grid      │
│  [⊞] │                                    │
│  [🔍]│                                    │
│  [👥]│                                    │
│      │                                    │
│  [+] │  (gradient upload button)          │
│  [👤]│  (avatar)                          │
└──────┴────────────────────────────────────┘
```

Sidebar items (top to bottom):
1. Logo "P" (gradient text, links to `#/gallery`)
2. Gallery icon (links to `#/gallery`, active = gradient stroke)
3. Search icon (links to `#/browse/trending` or opens search UI — placeholder for now)
4. Following feed icon (links to `#/feed`)
5. *(spacer)*
6. Upload button (gradient fill, rounded square — triggers upload modal)
7. Avatar (links to `#/u/:username`, gradient ring when on profile page)

### Mobile (< 768px) — Bottom Tab Bar

Top bar: gradient logo text left, avatar right.
Bottom tabs: Gallery · Search · **+** (raised gradient circle) · Profile.

---

## Pages & Components

### Sign-in (`/auth`)
- Centered card, white background, subtle shadow.
- Large gradient logo text at top.
- Tagline: *"Share your world. Keep what's yours."*
- Google "Continue with Google" button (standard Google styling, full-width).
- No other sign-in options.

### Gallery (`/gallery`) — authenticated
- **Profile header:** gradient-ring avatar, username, post/follower/following counts, "+ New Post" gradient button.
- **Tabs:** "My Posts" (grid icon) | "Feed" (people icon). Border-bottom indicator on active tab.
- **Photo grid:** 3-column square grid, 2px gap, no border-radius on cells. Hover reveals semi-transparent overlay with like count.
- **Empty state:** centered illustration placeholder + "Upload your first photo" CTA.

### Username registration (new user step inside `/auth`)
- Same card layout as sign-in.
- Single input: "Choose a username".
- Gradient "Continue" button.

### Upload flow
- Clicking "+ New Post" (sidebar button or bottom tab) opens a **bottom sheet on mobile** / **centered modal on desktop**.
- Drag-and-drop zone or file picker.
- After file selected: shows preview thumbnail + title input + tags input + public/private toggle.
- Confirm button: gradient "Share" (public) or "Save privately" (private).
- **Upload mechanics are unchanged** — the Drive upload fires on confirm using the existing `Uploader` logic. The modal is purely a metadata-collection UI wrapper around the same fire-and-forget upload.

### Browse (`/browse/:tag`) & Profile (`/u/:username`)
- Same 3-column grid layout.
- Profile page shows avatar, bio, stats — same header pattern as gallery.
- No sidebar on these pages (they're public, unauthenticated) — just a minimal top bar with logo.

### Dark mode toggle
- Sun/moon icon at the bottom of the sidebar on desktop.
- On mobile: a sun/moon icon in the top bar (next to avatar).
- No "profile menu" — keep it simple, no new menu component.
- Persisted to `localStorage` key `pf_theme`. Defaults to `light`.

---

## CSS Architecture

Single `src/index.css` file. CSS custom properties for all tokens. No Tailwind — keep the existing hand-written CSS approach.

Changes to `index.css`:
- Flip default tokens to light values.
- Add `[data-theme="dark"]` overrides (instead of `prefers-color-scheme` only, to support manual toggle).
- Add `@media (prefers-color-scheme: dark)` as fallback for users who haven't toggled.
- Add gradient utility classes: `.grad-bg`, `.grad-text`, `.grad-border`.
- Add sidebar, bottom-nav, profile-header, photo-grid, tab-bar component styles.
- **Also style pre-existing orphaned class names** used by `BrowsePage` and `ProfilePage`: `.feed-grid`, `.feed-item`, `.profile-page`, `.profile-header`, `.display-name`, `.badge`. These pages use these classes already — they just lack CSS definitions.
- Sweep all **inline `rgba(124,106,245,...)` references** (old purple accent) — replace with CSS variable or the new gradient accent colour. Known location: `Uploader.tsx` drag-hover tint.

The `data-theme` attribute lives on `<html>` and is set by a small script in `index.html` (before React mounts) to avoid flash of wrong theme.

Remove `--radius-lg` from the token list — it is not referenced by any component in this spec.

---

## What Is NOT Changing

- All auth logic, session management, worker API — untouched.
- Routing structure.
- Crypto / Drive / upload mechanics.
- All existing tests.
