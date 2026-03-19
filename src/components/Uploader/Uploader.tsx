import { useRef, useState, DragEvent } from 'react'
import { DriveAdapter, requestDriveToken } from '../../lib/storage/gdrive'
import { getSessionToken } from '../../lib/session'

const API_URL = import.meta.env['VITE_API_URL'] as string

interface Post {
  id: string
  driveFileId: string
  drivePublicUrl: string | null
  title: string | null
  tags: string[]
  isPublic: boolean
  createdAt: number
}

interface UploaderProps {
  onUploaded?: (post: Post) => void
}

interface UploadState {
  name: string
  progress: 'uploading' | 'done' | 'error'
  error?: string
}

export default function Uploader({ onUploaded }: UploaderProps) {
  const [items, setItems] = useState<UploadState[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const driveRef = useRef<DriveAdapter | null>(null)

  function updateItem(name: string, update: Partial<UploadState>) {
    setItems((prev) => prev.map((i) => i.name === name ? { ...i, ...update } : i))
  }

  async function getDrive(): Promise<DriveAdapter> {
    if (driveRef.current) return driveRef.current
    const token = await requestDriveToken()
    driveRef.current = new DriveAdapter(token)
    return driveRef.current
  }

  async function uploadFile(file: File) {
    setItems((prev) => [...prev, { name: file.name, progress: 'uploading' }])
    try {
      const drive = await getDrive()
      const filesFolder = await drive.getSubFolderId('files')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const driveFile = await drive.uploadImage(file.name, bytes, file.type, filesFolder)
      const publicUrl = await drive.makePublic(driveFile.id)

      const res = await fetch(`${API_URL}/posts`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${getSessionToken()}`,
        },
        body: JSON.stringify({
          driveFileId: driveFile.id,
          drivePublicUrl: publicUrl,
          title: file.name.replace(/\.[^.]+$/, ''),
          tags: [],
          isPublic: true,
        }),
      })
      if (!res.ok) throw new Error('Failed to publish post')
      const { id } = await res.json() as { id: string }

      updateItem(file.name, { progress: 'done' })
      onUploaded?.({
        id,
        driveFileId: driveFile.id,
        drivePublicUrl: publicUrl,
        title: file.name.replace(/\.[^.]+$/, ''),
        tags: [],
        isPublic: true,
        createdAt: Date.now(),
      })
    } catch (e) {
      updateItem(file.name, {
        progress: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) uploadFile(file)
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
                {item.progress === 'uploading' && 'Uploading…'}
                {item.progress === 'done' && 'Done'}
                {item.progress === 'error' && (item.error ?? 'Error')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
