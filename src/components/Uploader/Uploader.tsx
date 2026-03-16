/**
 * Drag-and-drop uploader.
 *
 * For each file:
 *  1. Generate a per-file FEK in the crypto worker
 *  2. Encrypt the file bytes (worker)
 *  3. Generate a thumbnail + encrypt it (worker)
 *  4. Compute blurhash (main thread — fast)
 *  5. Upload encrypted blobs to Google Drive
 *  6. Add a FileEntry (with wrapped FEK) to the index
 */
import { useRef, useState, DragEvent } from 'react'
import { encode as encodeBlurhash } from 'blurhash'
import { wrapFek, toBase64url } from '../../lib/crypto'
import { getCryptoWorker } from '../../lib/crypto-worker'
import { useKeystore } from '../../lib/keystore'
import { randomId } from '../../lib/index-manager'
import type { FileEntry } from '../../lib/index-manager'

interface UploadState {
  name: string
  progress: 'encrypting' | 'uploading' | 'done' | 'error'
  error?: string
}

interface UploaderProps {
  onUploaded?: (entry: FileEntry) => void
}

export default function Uploader({ onUploaded }: UploaderProps) {
  const [items, setItems]     = useState<UploadState[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)

  const keys  = useKeystore((s) => s.keys)
  const drive = useKeystore((s) => s.drive)
  const index = useKeystore((s) => s.index)

  function updateItem(name: string, update: Partial<UploadState>) {
    setItems((prev) =>
      prev.map((i) => i.name === name ? { ...i, ...update } : i),
    )
  }

  async function uploadFile(file: File) {
    const worker = getCryptoWorker()

    setItems((prev) => [...prev, { name: file.name, progress: 'encrypting' }])

    try {
      // 1. Read file bytes
      const fileBytes = new Uint8Array(await file.arrayBuffer())

      // 2. Generate FEK + encrypt file
      const fek           = await worker.generateFek()
      const encryptedFile = await worker.encryptFile(fileBytes.slice(), fek.slice())

      // 3. Generate thumbnail (if image) + encrypt it
      let encryptedThumb: Uint8Array | null = null
      let blurhash: string | null = null
      const thumbFek = await worker.generateFek()

      if (file.type.startsWith('image/')) {
        try {
          const { thumbBytes, hash } = await generateThumbnail(file)
          encryptedThumb = await worker.encryptThumb(thumbBytes, thumbFek.slice())
          blurhash = hash
        } catch {
          // Non-critical — continue without thumbnail
        }
      }

      // 4. Wrap FEK with owner public key
      const wrappedFek = await wrapFek(fek, keys!.identity.publicKey)
      fek.fill(0)
      thumbFek.fill(0)

      updateItem(file.name, { progress: 'uploading' })

      // 5. Upload to Drive
      const filesFolder  = await drive!.getSubFolderId('files')
      const thumbsFolder = await drive!.getSubFolderId('thumbs')

      const fileId   = randomId()
      const driveFile = await drive!.upload(`${fileId}.enc`, encryptedFile, filesFolder)

      let driveThumbId: string | null = null
      if (encryptedThumb) {
        const driveThumb = await drive!.upload(`${fileId}_thumb.enc`, encryptedThumb, thumbsFolder)
        driveThumbId = driveThumb.id
      }

      // 6. Add to index
      const entry: FileEntry = {
        id: fileId,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        blurhash,
        driveFileId: driveFile.id,
        driveThumbId,
        wrappedFek: toBase64url(wrappedFek),
        uploadedAt: new Date().toISOString(),
        albumIds: [],
      }
      await index!.addFile(entry)

      updateItem(file.name, { progress: 'done' })
      onUploaded?.(entry)
    } catch (e) {
      updateItem(file.name, {
        progress: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      uploadFile(file)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          padding: '2rem',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
          background: dragging ? 'rgba(124,106,245,0.05)' : 'transparent',
        }}
      >
        <p style={{ marginBottom: '0.5rem' }}>Drag photos here or click to browse</p>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Files are encrypted on your device before upload.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {items.map((item) => (
            <div key={item.name} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              fontSize: '0.875rem', padding: '0.5rem',
              background: 'var(--surface)', borderRadius: 'var(--radius)',
            }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              <span style={{
                color: item.progress === 'done' ? '#4caf50'
                  : item.progress === 'error' ? 'var(--danger)'
                  : 'var(--accent)',
              }}>
                {item.progress === 'encrypting' && 'Encrypting…'}
                {item.progress === 'uploading'  && 'Uploading…'}
                {item.progress === 'done'       && 'Done'}
                {item.progress === 'error'      && (item.error ?? 'Error')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Thumbnail generation ─────────────────────────────────────────────────────

const THUMB_SIZE = 320

async function generateThumbnail(file: File): Promise<{ thumbBytes: Uint8Array; hash: string }> {
  const bitmapSrc = await createImageBitmap(file)

  const scale  = Math.min(THUMB_SIZE / bitmapSrc.width, THUMB_SIZE / bitmapSrc.height, 1)
  const width  = Math.round(bitmapSrc.width  * scale)
  const height = Math.round(bitmapSrc.height * scale)

  const canvas  = new OffscreenCanvas(width, height)
  const ctx     = canvas.getContext('2d')!
  ctx.drawImage(bitmapSrc, 0, 0, width, height)
  bitmapSrc.close()

  // Blurhash from a tiny version (faster)
  const bhCanvas = new OffscreenCanvas(32, 32)
  const bhCtx    = bhCanvas.getContext('2d')!
  bhCtx.drawImage(canvas, 0, 0, 32, 32)
  const imageData = bhCtx.getImageData(0, 0, 32, 32)
  const hash = encodeBlurhash(imageData.data, 32, 32, 4, 3)

  // Full thumbnail as JPEG bytes
  const blob  = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
  const bytes = new Uint8Array(await blob.arrayBuffer())

  return { thumbBytes: bytes, hash }
}
