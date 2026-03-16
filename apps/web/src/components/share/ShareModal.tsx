'use client'

import { useState } from 'react'
import { useKeystore } from '@/lib/keystore'
import { createShareKey } from '@/lib/crypto'
import { shares as sharesApi, type ApiFile } from '@/lib/api'
import { toBase64url, fromBase64url } from '@picturefied/crypto'

interface ShareModalProps {
  file: ApiFile
  onClose: () => void
}

export function ShareModal({ file, onClose }: ShareModalProps) {
  const { keys } = useKeystore()
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const [expiryHours,   setExpiryHours]   = useState<number | ''>('')
  const [allowDownload, setAllowDownload] = useState(false)

  async function handleCreate() {
    if (!keys || !file.wrappedFek) return
    setLoading(true)
    setError(null)

    try {
      // Step 1: Decrypt the file's FEK, re-wrap with a fresh random share link key.
      // The share link key will be embedded in the URL fragment (never sent to server).
      const { shareLinkKey, linkWrappedFek } = await createShareKey(
        file.wrappedFek,
        keys.identity.publicKey,
        keys.identity.privateKey,
      )

      // Step 2: Create the share record on the server
      const expiresAt = expiryHours
        ? new Date(Date.now() + Number(expiryHours) * 3_600_000).toISOString()
        : undefined

      const { url, shareToken } = await sharesApi.create({
        resourceType:   'file',
        resourceId:     file.id,
        linkWrappedFek,
        permissions:    { view: true, download: allowDownload },
        expiresAt,
      })

      // Step 3: The share URL embeds the key in the fragment
      // The fragment is never sent to the server — only the recipient's browser reads it
      const fullUrl = `${url}#${shareLinkKey}`
      setShareUrl(fullUrl)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">Share photo</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl">✕</button>
        </div>

        {!shareUrl ? (
          <>
            <p className="text-zinc-400 text-sm">
              A link will be created. Only people with the link can view this photo.
              The encryption key is embedded in the link — your server never sees it.
            </p>

            <div className="space-y-3">
              <label className="block">
                <span className="text-zinc-400 text-sm">Link expires after</span>
                <select
                  className="mt-1 w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm"
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Never</option>
                  <option value="1">1 hour</option>
                  <option value="24">24 hours</option>
                  <option value="168">7 days</option>
                  <option value="720">30 days</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="rounded"
                />
                Allow recipient to download original file
              </label>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              {loading ? 'Creating link…' : 'Create share link'}
            </button>
          </>
        ) : (
          <>
            <p className="text-zinc-400 text-sm">Link created. Copy it and send to the recipient.</p>

            <div className="bg-zinc-800 rounded-lg p-3 text-xs text-zinc-300 break-all font-mono">
              {shareUrl}
            </div>

            <p className="text-zinc-600 text-xs">
              The key after the <code>#</code> is required to view the photo.
              Do not share the URL without it.
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium transition-colors"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
