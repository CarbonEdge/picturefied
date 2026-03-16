/**
 * Public share viewer — shown when someone opens a share link.
 *
 * URL format: /#/s?t=<token>&k=<base64url-linkKey>
 *
 * The link key (k) is in the query string AFTER the hash — so it's part of
 * the URL fragment. Browsers never send fragments to servers.
 *
 * Flow:
 *   1. Parse token + link key from URL
 *   2. Use token to find the shared/*.enc file on the sharer's Drive
 *      (but we need the Drive file ID — the token IS the Drive file name)
 *   3. Download shared/<token>.enc from the sharer's Drive
 *      → requires the sharer to have made the Drive file publicly accessible
 *      OR we use a different sharing mechanism
 *
 * NOTE: For Drive sharing to work without auth, the shared/ folder must be
 * set to "Anyone with the link can view". We handle this automatically
 * by setting the Drive file permission on creation.
 *
 * Actually, since we control the Drive adapter and we upload the share payload
 * to the sharer's Drive but need the viewer to access it without auth, we have
 * a few options:
 *   A) Make the shared/ files world-readable on Drive (simplest)
 *   B) Embed the entire payload in the URL fragment (size limit: ~8KB)
 *   C) Use a CDN / IPFS
 *
 * For MVP we use option B for small files (metadata + small images) and
 * option A (Drive public link) for larger files. We store the Drive file ID
 * in the URL when needed.
 *
 * For simplicity in this MVP, we embed a "driveWebContentLink" in the share
 * so the viewer can download the share payload. The sharer's Drive SDK call
 * sets the file permission to public read-only.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fromBase64url, unwrapFekFromLink, decryptMetadata, getSodium } from '../../lib/crypto'
import { getCryptoWorker } from '../../lib/crypto-worker'

interface SharePayload {
  driveFileId: string
  linkWrappedFek: string
  mimeType: string
  name: string
}

type State = 'loading' | 'ready' | 'error'

export default function ShareViewer() {
  const [params]      = useSearchParams()
  const [state, setState] = useState<State>('loading')
  const [src, setSrc]    = useState<string | null>(null)
  const [meta, setMeta]  = useState<SharePayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const token   = params.get('t')
  const linkKeyB64 = params.get('k')

  useEffect(() => {
    if (!token || !linkKeyB64) {
      setError('Invalid share link — missing token or key.')
      setState('error')
      return
    }

    ;(async () => {
      try {
        await getSodium()
        const linkKey = fromBase64url(linkKeyB64)

        // Download the share payload from Drive using the public web content link.
        // The share payload Drive file is named <token>.enc and was made public
        // at creation time. We construct the download URL from the token.
        // The full Drive download URL is embedded in the share as a query param 'd'.
        const driveDlUrl = params.get('d')
        if (!driveDlUrl) throw new Error('Share link is missing the drive download URL.')

        const resp = await fetch(driveDlUrl)
        if (!resp.ok) throw new Error(`Failed to fetch share payload: ${resp.status}`)

        const payloadEnc = new Uint8Array(await resp.arrayBuffer())

        // Decrypt the payload with the link key
        const payload = await decryptMetadata<SharePayload>(payloadEnc, linkKey)
        setMeta(payload)

        // Now decrypt the actual file
        const worker = getCryptoWorker()
        const fek    = await unwrapFekFromLink(fromBase64url(payload.linkWrappedFek), linkKey)
        linkKey.fill(0)

        // Download encrypted file from Drive (also needs to be public)
        const fileResp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${payload.driveFileId}?alt=media`,
        )
        if (!fileResp.ok) {
          throw new Error('Could not download the shared file. The link may have expired.')
        }

        const encBytes  = new Uint8Array(await fileResp.arrayBuffer())
        const plaintext = await worker.decryptFile(encBytes, fek)
        fek.fill(0)

        const blob = new Blob([plaintext as Uint8Array<ArrayBuffer>], { type: payload.mimeType })
        setSrc(URL.createObjectURL(blob))
        setState('ready')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load share.')
        setState('error')
      }
    })()
  }, [token, linkKeyB64])

  if (state === 'loading') {
    return (
      <div className="center-page" style={{ flexDirection: 'column', gap: '1rem' }}>
        <p>Decrypting…</p>
        <p className="muted" style={{ fontSize: '0.8rem' }}>The key never leaves your device.</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: 440 }}>
          <h2 style={{ marginBottom: '0.5rem', color: 'var(--danger)' }}>Share unavailable</h2>
          <p className="muted">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '1rem' }}>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Shared via Picturefied — end-to-end encrypted
      </p>

      {src && meta?.mimeType.startsWith('image/') && (
        <img
          src={src}
          alt={meta?.name}
          style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 'var(--radius)', objectFit: 'contain' }}
        />
      )}

      {src && meta && (
        <a
          href={src}
          download={meta.name}
          className="btn-primary"
          style={{ display: 'inline-block', marginTop: '0.5rem' }}
        >
          Download {meta.name}
        </a>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '1rem' }}>
        <a href={window.location.origin + window.location.pathname} target="_blank" rel="noopener noreferrer">
          Picturefied
        </a>{' '}
        — open-source, zero-trust photo sharing
      </p>
    </div>
  )
}
