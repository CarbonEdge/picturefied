import { createElement } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/session'
import GalleryPage from './pages/GalleryPage'
import SharePage from './pages/SharePage'
import AuthPage from './pages/AuthPage'
import BrowsePage from './pages/BrowsePage'
import ProfilePage from './pages/ProfilePage'
import FeedPage from './pages/FeedPage'

/**
 * Routing:
 *  /            → redirect based on auth state
 *  /auth        → Google Sign-In (and username registration for new users)
 *  /gallery     → main gallery (requires session)
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
  if (isAuthenticated()) return createElement(Navigate, { to: '/gallery', replace: true })
  return createElement(Navigate, { to: '/auth', replace: true })
}

function ProtectedGallery() {
  if (!isAuthenticated()) return createElement(Navigate, { to: '/', replace: true })
  return createElement(GalleryPage)
}
