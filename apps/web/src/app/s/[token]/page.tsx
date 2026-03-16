'use client'

import { useEffect, useState } from 'react'
import {
  getSodium,
  unwrapFekFromLink,
  decryptBytes,
  fromBase64url,
} from '@picturefied/crypto'
import { shares as sharesApi, files as filesApi } from '@/lib/api'

/**
 * Public share link viewer.
 * No authentication required.
 *
 * URL format: /s/[shareToken]#[base64url(shareLinkKey)]
 *
 * The share link key is in the URL fragment — never sent to the server.
 * This page extracts the key, fetches the linkWrappedFek from the server,
 * decrypts the FEK, then fetches and decrypts the file.
 */
export default function ShareViewPage({ params }: { params: { token: string } }) {
  const [status,    setStatus]    = useState<'loading' | 'ready' | 'error'>('loading')
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null)
  const [fileType,  setFileType]  = useState<string>('image')

  useEffect(() => {
    const token = params.token
    // The key is in the fragment — window.location.hash includes the '#'
    const fragment = window.location.hash.slice(1)

    if (!fragment) {
      setErrorMsg('Invalid share link — missing decryption key.')
      setStatus('error')
      return
    }

    let objectUrl: string | null = null

    async function load() {
      try {
        await getSodium()

        const shareLinkKey = fromBase64url(fragment)

        // Fetch share metadata from server
        const share = await sharesApi.resolve(token)

        if (!share.fileId) {
          setErrorMsg('Album shares are not yet supported in this viewer.')
          setStatus('error')
          return
        }

        // Decrypt the FEK using the share link key from the URL fragment
        const linkWrappedFek = fromBase64url(share.linkWrappedFek)
        const fek = await unwrapFekFromLink(linkWrappedFek, shareLinkKey)

        // Fetch the encrypted file download URL
        const { url } = await filesApi.getDownloadUrl(share.fileId)

        // Fetch and decrypt the encrypted file
        const res = await fetch(url)
        const encBytes = new Uint8Array(await res.arrayBuffer())
        const plainBytes = await decryptBytes(encBytes, fek)

        // Zero FEK immediately after decryption
        fek.fill(0)

        // Guess type from first bytes (magic numbers)
        const mime = detectMimeType(plainBytes) ?? 'application/octet-stream'
        setFileType(mime.startsWith('video/') ? 'video' : 'image')

        const blob = new Blob([plainBytes], { type: mime })
        objectUrl = URL.createObjectURL(blob)
        setObjectUrl(objectUrl)
        setStatus('ready')
      } catch (err) {
        setErrorMsg(String(err))
        setStatus('error')
      }
    }

    load()

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [params.token])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      {status === 'loading' && (
        <p className="text-zinc-400 text-sm">Decrypting…</p>
      )}

      {status === 'error' && (
        <div className="text-center space-y-2 p-6">
          <p className="text-red-400 font-medium">Could not open this link</p>
          <p className="text-zinc-500 text-sm max-w-sm">{errorMsg}</p>
          <p className="text-zinc-600 text-xs mt-4">
            The link may have expired, been revoked, or may be malformed.
          </p>
        </div>
      )}

      {status === 'ready' && objectUrl && (
        <div className="w-full h-screen flex items-center justify-center">
          {fileType === 'image' ? (
            <img
              src={objectUrl}
              className="max-w-full max-h-full object-contain"
              alt="Shared photo"
            />
          ) : (
            <video
              src={objectUrl}
              controls
              className="max-w-full max-h-full"
            />
          )}
        </div>
      )}
    </div>
  )
}

/** Detect MIME type from magic bytes (best-effort). */
function detectMimeType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp'
  if (bytes[4] === 0x66 && bytes[5] === 0x74) return 'video/mp4'
  return null
}
