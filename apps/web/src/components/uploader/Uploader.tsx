'use client'

import { useCallback, useRef, useState } from 'react'
import { useKeystore } from '@/lib/keystore'
import { encryptFile, encryptThumbnail, generateThumbnail } from '@/lib/crypto'
import { files as filesApi } from '@/lib/api'
import { fromBase64url } from '@picturefied/crypto'
import type { FileMetadata } from '@picturefied/crypto'

interface UploadJob {
  file: File
  status: 'pending' | 'encrypting' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

interface UploaderProps {
  onUploadComplete?: (fileId: string) => void
}

export function Uploader({ onUploadComplete }: UploaderProps) {
  const { keys } = useKeystore()
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const updateJob = useCallback((index: number, patch: Partial<UploadJob>) => {
    setJobs((prev) => prev.map((j, i) => i === index ? { ...j, ...patch } : j))
  }, [])

  const processFile = useCallback(async (file: File, index: number) => {
    if (!keys) return

    try {
      updateJob(index, { status: 'encrypting', progress: 10 })

      const ownerPublicKey = keys.identity.publicKey
      const fileBytes = new Uint8Array(await file.arrayBuffer())

      // Build metadata from the file
      const metadata: FileMetadata = {
        filename:     file.name,
        mimeTypeHint: file.type || 'application/octet-stream',
        sizeBytes:    file.size,
        takenAt:      new Date().toISOString(),
        tags:         [],
      }

      updateJob(index, { progress: 20 })

      // Encrypt file + metadata in the Web Worker
      const { encryptedFile, wrappedFek, encryptedMetadata, contentHash } =
        await encryptFile(fileBytes, metadata, ownerPublicKey)

      updateJob(index, { progress: 40 })

      // Generate and encrypt thumbnail (images only)
      let wrappedThumbnailFek: string | undefined
      let encryptedThumb: Uint8Array | undefined
      let blurhash: string | undefined

      if (file.type.startsWith('image/')) {
        const thumbBytes = await generateThumbnail(file)
        const thumbResult = await encryptThumbnail(thumbBytes, ownerPublicKey)
        wrappedThumbnailFek = thumbResult.wrappedThumbnailFek
        encryptedThumb = thumbResult.encryptedThumb

        // Generate blurhash for instant placeholder
        blurhash = await computeBlurhash(file)
      }

      updateJob(index, { progress: 60, status: 'uploading' })

      // Request upload intent from API
      const intent = await filesApi.uploadIntent({
        sizeBytes:    encryptedFile.length,
        mimeTypeHint: 'application/octet-stream', // always octet-stream — never reveal true mime
      })

      // Upload encrypted file to storage
      if (intent.presigned && intent.uploadUrl) {
        await fetch(intent.uploadUrl, {
          method:  intent.method ?? 'PUT',
          headers: intent.headers ?? {},
          body:    encryptedFile,
        })
      } else if (intent.uploadEndpoint) {
        await fetch(intent.uploadEndpoint, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(encryptedFile.length) },
          body:    encryptedFile,
        })
      }

      updateJob(index, { progress: 80 })

      // Upload encrypted thumbnail if we have one
      let thumbnailReference: string | undefined
      if (encryptedThumb) {
        const thumbIntent = await filesApi.uploadIntent({ sizeBytes: encryptedThumb.length })
        if (thumbIntent.presigned && thumbIntent.uploadUrl) {
          await fetch(thumbIntent.uploadUrl, {
            method: thumbIntent.method ?? 'PUT',
            body:   encryptedThumb,
          })
          thumbnailReference = thumbIntent.reference
        }
      }

      // Confirm upload — store all encrypted metadata + wrapped keys
      const { fileId } = await filesApi.uploadComplete({
        fileId:              intent.fileId,
        wrappedFek,
        encryptedMetadata,
        thumbnailReference,
        wrappedThumbnailFek,
        blurhash,
        contentHash,
      })

      updateJob(index, { status: 'done', progress: 100 })
      onUploadComplete?.(fileId)
    } catch (err) {
      updateJob(index, { status: 'error', error: String(err) })
    }
  }, [keys, updateJob, onUploadComplete])

  const handleFiles = useCallback((incoming: FileList | null) => {
    if (!incoming || !keys) return

    const newJobs: UploadJob[] = Array.from(incoming).map((f) => ({
      file: f,
      status: 'pending',
      progress: 0,
    }))

    setJobs((prev) => {
      const start = prev.length
      setTimeout(() => {
        newJobs.forEach((_, i) => processFile(incoming[i]!, start + i))
      }, 0)
      return [...prev, ...newJobs]
    })
  }, [keys, processFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  if (!keys) return null

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <p className="text-zinc-400 text-sm">
        Drop photos here or <span className="text-white underline">browse</span>
      </p>
      <p className="text-zinc-600 text-xs mt-1">All files are encrypted on your device before upload</p>

      {jobs.length > 0 && (
        <div className="mt-4 space-y-2 text-left" onClick={(e) => e.stopPropagation()}>
          {jobs.map((job, i) => (
            <UploadRow key={i} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}

function UploadRow({ job }: { job: UploadJob }) {
  const statusLabel: Record<UploadJob['status'], string> = {
    pending:    'Waiting…',
    encrypting: 'Encrypting…',
    uploading:  'Uploading…',
    done:       'Done',
    error:      'Error',
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="truncate flex-1 text-zinc-300">{job.file.name}</span>
      <span className="text-zinc-500 shrink-0">{statusLabel[job.status]}</span>
      {job.status !== 'done' && job.status !== 'error' && (
        <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      )}
      {job.status === 'error' && (
        <span className="text-red-400 text-xs truncate max-w-32">{job.error}</span>
      )}
    </div>
  )
}

// Lazy-load blurhash to avoid it blocking the upload
async function computeBlurhash(file: File): Promise<string | undefined> {
  try {
    const { encode } = await import('blurhash')
    const img = new Image()
    const url = URL.createObjectURL(file)

    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = rej
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width  = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, 32, 32)
    URL.revokeObjectURL(url)

    const { data } = ctx.getImageData(0, 0, 32, 32)
    return encode(data, 32, 32, 4, 4)
  } catch {
    return undefined
  }
}
