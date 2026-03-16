/**
 * Gallery — masonry-style grid of the user's photos.
 *
 * Thumbnails are decrypted lazily as they enter the viewport
 * (IntersectionObserver). While loading, the blurhash placeholder is shown.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { decode as decodeBlurhash } from 'blurhash'
import { unwrapFek, fromBase64url } from '../../lib/crypto'
import { getCryptoWorker } from '../../lib/crypto-worker'
import { useKeystore } from '../../lib/keystore'
import ShareModal from '../Share/ShareModal'
import type { FileEntry } from '../../lib/index-manager'

interface GalleryProps {
  files: FileEntry[]
  onDeleted?: (id: string) => void
}

export default function Gallery({ files }: GalleryProps) {
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [sharing, setSharing]   = useState<FileEntry | null>(null)

  if (files.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
        <p>No photos yet. Drop some above to get started.</p>
      </div>
    )
  }

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '0.5rem',
      }}>
        {files.map((file) => (
          <PhotoCard
            key={file.id}
            file={file}
            onOpen={() => setSelected(file)}
            onShare={() => setSharing(file)}
          />
        ))}
      </div>

      {selected && (
        <PhotoViewer
          file={selected}
          onClose={() => setSelected(null)}
          onShare={() => { setSharing(selected); setSelected(null) }}
        />
      )}

      {sharing && (
        <ShareModal
          file={sharing}
          onClose={() => setSharing(null)}
        />
      )}
    </>
  )
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({
  file,
  onOpen,
  onShare,
}: {
  file: FileEntry
  onOpen: () => void
  onShare: () => void
}) {
  const [src, setSrc]     = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const ref               = useRef<HTMLDivElement>(null)
  const keys              = useKeystore((s) => s.keys)
  const drive             = useKeystore((s) => s.drive)

  const decrypt = useCallback(async () => {
    if (!file.driveThumbId || !keys || !drive) return
    try {
      const worker    = getCryptoWorker()
      const wrappedFek = fromBase64url(file.wrappedFek)
      const fek       = await unwrapFek(wrappedFek, keys.identity.publicKey, keys.identity.privateKey)
      const encrypted  = await drive.download(file.driveThumbId)
      const plaintext  = await worker.decryptThumb(encrypted, fek)
      fek.fill(0)

      const blob = new Blob([plaintext as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })
      setSrc(URL.createObjectURL(blob))
    } catch {
      // Failed to decrypt — show broken state
    }
  }, [file, keys, drive])

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReady(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (ready && !src) decrypt()
  }, [ready, src, decrypt])

  const placeholder = file.blurhash ? blurhashUrl(file.blurhash, 32, 32) : null

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        aspectRatio: '1',
        overflow: 'hidden',
        borderRadius: 'var(--radius)',
        background: 'var(--surface)',
        cursor: 'pointer',
      }}
      onClick={onOpen}
    >
      {(placeholder && !src) && (
        <img src={placeholder} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(4px)', transform: 'scale(1.05)' }} />
      )}
      {src && (
        <img src={src} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {!src && !placeholder && (
        <div style={{ width: '100%', height: '100%', background: 'var(--border)' }} />
      )}

      {/* Hover actions */}
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)',
        display: 'flex', alignItems: 'flex-end', padding: '0.5rem', gap: '0.25rem',
        opacity: 0, transition: 'opacity 0.15s',
      }}
        className="photo-actions"
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.4)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3em 0.6em' }} onClick={onShare}>
          Share
        </button>
      </div>
    </div>
  )
}

// ─── Full-screen viewer ───────────────────────────────────────────────────────

function PhotoViewer({
  file,
  onClose,
  onShare,
}: {
  file: FileEntry
  onClose: () => void
  onShare: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const keys  = useKeystore((s) => s.keys)
  const drive = useKeystore((s) => s.drive)

  useEffect(() => {
    if (!keys || !drive) return
    const worker = getCryptoWorker()
    ;(async () => {
      const wrappedFek = fromBase64url(file.wrappedFek)
      const fek = await unwrapFek(wrappedFek, keys.identity.publicKey, keys.identity.privateKey)
      const encrypted = await drive.download(file.driveFileId)
      const plaintext = await worker.decryptFile(encrypted, fek)
      fek.fill(0)
      const blob = new Blob([plaintext as Uint8Array<ArrayBuffer>], { type: file.mimeType })
      setSrc(URL.createObjectURL(blob))
    })().catch(console.error)

    return () => { if (src) URL.revokeObjectURL(src) }
  }, [file, keys, drive])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div style={{
        position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem',
      }} onClick={(e) => e.stopPropagation()}>
        <button className="btn-ghost" onClick={onShare}>Share</button>
        {src && (
          <a
            href={src}
            download={file.name}
            className="btn-ghost"
            style={{ padding: '0.6em 1.2em', borderRadius: 'var(--radius)', border: '1px solid var(--border)', color: 'var(--muted)' }}
            onClick={(e) => e.stopPropagation()}
          >
            Download
          </a>
        )}
        <button className="btn-ghost" onClick={onClose}>✕</button>
      </div>

      {src ? (
        <img
          src={src}
          alt={file.name}
          style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div style={{ color: 'var(--muted)' }}>Decrypting…</div>
      )}

      <p style={{ position: 'absolute', bottom: '1rem', color: 'var(--muted)', fontSize: '0.8rem' }}>
        {file.name}
      </p>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blurhashUrl(hash: string, w: number, h: number): string {
  try {
    const pixels = decodeBlurhash(hash, w, h)
    const canvas  = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    const ctx     = canvas.getContext('2d')!
    const img     = ctx.createImageData(w, h)
    img.data.set(pixels)
    ctx.putImageData(img, 0, 0)
    return canvas.toDataURL()
  } catch {
    return ''
  }
}
