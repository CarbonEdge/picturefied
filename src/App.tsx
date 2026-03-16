import { createElement } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useKeystore } from './lib/keystore'
import SetupPage from './pages/SetupPage'
import UnlockPage from './pages/UnlockPage'
import GalleryPage from './pages/GalleryPage'
import SharePage from './pages/SharePage'

/**
 * Routing:
 *  /           → setup (first visit) or unlock (returning)
 *  /gallery    → main gallery (requires unlocked keystore)
 *  /s          → public share viewer (reads key from URL params after #)
 *
 * HashRouter: GitHub Pages serves the same index.html for all paths —
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
        <Rt path="/setup" element={createElement(SetupPage)} />
        <Rt path="/unlock" element={createElement(UnlockPage)} />
        <Rt path="/gallery" element={createElement(ProtectedGallery)} />
        <Rt path="/s" element={createElement(SharePage)} />
        <Rt path="*" element={createElement(Navigate, { to: '/', replace: true })} />
      </R>
    </HashRouter>
  )
}

function RootRedirect() {
  const hasConfig = sessionStorage.getItem('picturefied_drive_file_id') !== null
  return createElement(Navigate, { to: hasConfig ? '/unlock' : '/setup', replace: true })
}

function ProtectedGallery() {
  const isUnlocked = useKeystore((s) => s.isUnlocked())
  if (!isUnlocked) return createElement(Navigate, { to: '/', replace: true })
  return createElement(GalleryPage)
}
