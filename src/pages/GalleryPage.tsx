/**
 * Main gallery page — the home screen for authenticated users.
 * Shows the upload zone + photo grid.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Gallery from '../components/Gallery/Gallery'
import Uploader from '../components/Uploader/Uploader'
import { useKeystore } from '../lib/keystore'
import type { FileEntry } from '../lib/index-manager'

export default function GalleryPage() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)

  const index       = useKeystore((s) => s.index)
  const clearSession = useKeystore((s) => s.clearSession)
  const navigate    = useNavigate()

  useEffect(() => {
    if (!index) return
    index.listFiles().then((f) => {
      setFiles(f)
      setLoading(false)
    })
  }, [index])

  function handleUploaded(entry: FileEntry) {
    setFiles((prev) => [entry, ...prev])
  }

  function handleDeleted(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function logout() {
    clearSession()
    navigate('/', { replace: true })
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem', flex: 1 }}>Picturefied</h1>
        <button className="btn-ghost" style={{ fontSize: '0.85rem' }} onClick={logout}>
          Lock
        </button>
      </header>

      <div style={{ marginBottom: '1.5rem' }}>
        <Uploader onUploaded={handleUploaded} />
      </div>

      {loading ? (
        <p className="muted" style={{ textAlign: 'center', padding: '2rem' }}>Loading…</p>
      ) : (
        <Gallery files={files} onDeleted={handleDeleted} />
      )}
    </div>
  )
}
