'use client'

import { useEffect, useRef, useState } from 'react'
import { decode as decodeBlurhash } from 'blurhash'
import { useKeystore } from '@/lib/keystore'
import { decryptThumbnail } from '@/lib/crypto'
import { files as filesApi, type ApiFile } from '@/lib/api'
import { fromBase64url } from '@picturefied/crypto'

interface PhotoGridProps {
  items: ApiFile[]
  onPhotoClick: (file: ApiFile) => void
}

export function PhotoGrid({ items, onPhotoClick }: PhotoGridProps) {
  return (
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5">
      {items.map((file) => (
        <PhotoCell key={file.id} file={file} onClick={() => onPhotoClick(file)} />
      ))}
    </div>
  )
}

interface PhotoCellProps {
  file: ApiFile
  onClick: () => void
}

function PhotoCell({ file, onClick }: PhotoCellProps) {
  const { keys } = useKeystore()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const cellRef = useRef<HTMLDivElement>(null)

  // Decode blurhash into a data URL for instant placeholder
  const blurhashDataUrl = useRef<string | null>(null)
  if (file.blurhash && !blurhashDataUrl.current) {
    try {
      const pixels = decodeBlurhash(file.blurhash, 32, 32)
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')!
      const imageData = ctx.createImageData(32, 32)
      imageData.data.set(pixels)
      ctx.putImageData(imageData, 0, 0)
      blurhashDataUrl.current = canvas.toDataURL()
    } catch { /* ignore */ }
  }

  // Intersection Observer — only decrypt when cell is visible
  useEffect(() => {
    if (!keys || !file.thumbnailReference || !file.wrappedThumbnailFek) return

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()

        try {
          // Fetch encrypted thumbnail
          const { url } = await filesApi.getDownloadUrl(file.id + '/thumbnail')
          const res = await fetch(url)
          const encBytes = new Uint8Array(await res.arrayBuffer())

          // Decrypt in worker
          const plainBytes = await decryptThumbnail(
            encBytes,
            file.wrappedThumbnailFek!,
            keys.identity.publicKey,
            keys.identity.privateKey,
          )

          const blob = new Blob([plainBytes], { type: 'image/webp' })
          setObjectUrl(URL.createObjectURL(blob))
        } catch (err) {
          console.error('[PhotoCell] decrypt thumb failed', err)
        }
      },
      { threshold: 0.1 },
    )

    if (cellRef.current) observer.observe(cellRef.current)
    return () => observer.disconnect()
  }, [keys, file])

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [objectUrl])

  return (
    <div
      ref={cellRef}
      className="aspect-square bg-zinc-900 overflow-hidden cursor-pointer relative"
      onClick={onClick}
    >
      {/* Blurhash placeholder — always visible until thumbnail loads */}
      {blurhashDataUrl.current && !loaded && (
        <img
          src={blurhashDataUrl.current}
          className="absolute inset-0 w-full h-full object-cover blur-sm scale-110"
          aria-hidden
        />
      )}

      {/* Decrypted thumbnail */}
      {objectUrl && (
        <img
          src={objectUrl}
          className="w-full h-full object-cover"
          onLoad={() => setLoaded(true)}
        />
      )}

      {/* No thumbnail available */}
      {!file.thumbnailReference && !file.blurhash && (
        <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
          No preview
        </div>
      )}
    </div>
  )
}
