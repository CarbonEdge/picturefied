import { createElement } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useKeystore } from './lib/keystore'
import { isAuthenticated } from './lib/session'
import SetupPage from './pages/SetupPage'
import UnlockPage from './pages/UnlockPage'
import GalleryPage from './pages/GalleryPage'
import SharePage from './pages/SharePage'
import AuthPage from './pages/AuthPage'
import BrowsePage from './pages/BrowsePage'
import ProfilePage from './pages/ProfilePage'
import FeedPage from './pages/FeedPage'

/**
 * Routing:
 *  /            → redirect based on auth + unlock state
 *  /auth        → Google Sign-In (and username registration for new users)
 *  /setup       → connect Google Drive + optional passphrase (private mode)
 *  /unlock      → re-enter passphrase to unlock keys (returning private users)
 *  /gallery     → main gallery (requires unlocked keystore)
 *  /browse/:tag → public tag feed (no auth required)
 *  /u/:username → public profile (no auth required)
 *  /feed        → following feed (requires session)
 *  /s           → public share viewer (reads key from URL params after #)
 *
 * HashRouter: GitHub Pages serves index.html for all paths —
 * hash-based routing needs no server config.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const R = Routes as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Rt = Route as any

export default function App() {
  return (
    <HashRouter>
      <R>
        <Rt path="/" element={createElement(RootRedirect)} />
        <Rt path="/auth" element={createElement(AuthPage)} />
        <Rt path="/setup" element={createElement(SetupPage)} />
        <Rt path="/unlock" element={createElement(UnlockPage)} />
        <Rt path="/gallery" element={createElement(ProtectedGallery)} />
        <Rt path="/browse/:tag" element={createElement(BrowsePage)} />
        <Rt path="/u/:username" element={createElement(ProfilePage)} />
        <Rt path="/feed" element={createElement(FeedPage)} />
        <Rt path="/s" element={createElement(SharePage)} />
        <Rt path="*" element={createElement(Navigate, { to: '/', replace: true })} />
      </R>
    </HashRouter>
  )
}

function RootRedirect() {
  const isUnlocked = useKeystore((s) => s.isUnlocked())
  if (isUnlocked) return createElement(Navigate, { to: '/gallery', replace: true })
  if (isAuthenticated()) return createElement(Navigate, { to: '/unlock', replace: true })
  return createElement(Navigate, { to: '/auth', replace: true })
}

function ProtectedGallery() {
  const isUnlocked = useKeystore((s) => s.isUnlocked())
  if (!isUnlocked) return createElement(Navigate, { to: '/', replace: true })
  return createElement(GalleryPage)
}
