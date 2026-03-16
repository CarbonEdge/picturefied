/**
 * Share modal — creates a shareable link for a single file.
 *
 * The share link embeds everything needed to decrypt the file in the URL
 * fragment. Nothing sensitive ever reaches a server.
 *
 * Link format:
 *   https://username.github.io/picturefied/#/s?t=<token>&k=<base64url-linkKey>
 *
 * Where:
 *   t = share token (identifies the shared/*.enc file in Drive)
 *   k = link key (used to unwrap the FEK — never sent to any server)
 *
 * The shared/*.enc file in Drive contains:
 *   JSON { driveFileId, linkWrappedFek, mimeType, name }
 *   all encrypted with the link key.
 */
import { useState } from 'react'
import {
  unwrapFek,
  fromBase64url,
  generateShareLinkKey,
  wrapFekForLink,
  encryptMetadata,
  toBase64url,
} from '../../lib/crypto'
import { useKeystore } from '../../lib/keystore'
import { randomId } from '../../lib/index-manager'
import type { FileEntry } from '../../lib/index-manager'

interface Props {
  file: FileEntry
  onClose: () => void
}

type State = 'idle' | 'creating' | 'done'

export default function ShareModal({ file, onClose }: Props) {
  const [expiryDays, setExpiryDays] = useState<string>('7')
  const [shareUrl, setShareUrl]     = useState<string | null>(null)
  const [status, setStatus]         = useState<State>('idle')
  const [error, setError]           = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)

  const keys  = useKeystore((s) => s.keys)
  const drive = useKeystore((s) => s.drive)
  const index = useKeystore((s) => s.index)

  async function createShare() {
    if (!keys || !drive || !index) return
    setStatus('creating')
    setError(null)

    try {
      // 1. Unwrap the owner FEK
      const wrappedFek = fromBase64url(file.wrappedFek)
      const fek = await unwrapFek(wrappedFek, keys.identity.publicKey, keys.identity.privateKey)

      // 2. Generate a one-time link key
      const linkKey = await generateShareLinkKey()

      // 3. Wrap FEK with link key
      const linkWrappedFek = await wrapFekForLink(fek, linkKey)
      fek.fill(0)

      // 4. Build share payload and encrypt with link key
      const shareToken = randomId()
      const payload = {
        driveFileId: file.driveFileId,
        linkWrappedFek: toBase64url(linkWrappedFek),
        mimeType: file.mimeType,
        name: file.name,
      }
      const payloadEnc = await encryptMetadata(payload, linkKey)

      // 5. Upload share payload to Drive shared/ folder
      const sharedFolder = await drive.getSubFolderId('shared')
      await drive.upload(`${shareToken}.enc`, payloadEnc, sharedFolder)

      // 6. Record share in index
      const expiresAt = expiryDays
        ? new Date(Date.now() + parseInt(expiryDays, 10) * 86_400_000).toISOString()
        : null

      await index.addShare({
        id: shareToken,
        fileId: file.id,
        linkWrappedFek: toBase64url(linkWrappedFek),
        linkFekDriveId: shareToken,
        expiresAt,
        createdAt: new Date().toISOString(),
      })

      // 7. Build share URL — link key goes in #fragment
      const base = window.location.href.split('#')[0]
      const url  = `${base}#/s?t=${shareToken}&k=${toBase64url(linkKey)}`
      linkKey.fill(0)

      setShareUrl(url)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('idle')
    }
  }

  async function copy() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 480, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '0.25rem' }}>Share "{file.name}"</h3>
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '1.25rem' }}>
          The decryption key is embedded in the link — it never reaches any server.
          Anyone with the link can view the file (but not your other photos).
        </p>

        {status !== 'done' ? (
          <div className="form-stack">
            <div>
              <label className="label">Expires after</label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                style={{
                  background: 'var(--surface)', color: 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  padding: '0.6em 0.9em', width: '100%',
                }}
              >
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="">Never</option>
              </select>
            </div>
            {error && <p className="error">{error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={createShare}
                disabled={status === 'creating'}
              >
                {status === 'creating' ? 'Creating…' : 'Create share link'}
              </button>
            </div>
          </div>
        ) : (
          <div className="form-stack">
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '0.75rem', wordBreak: 'break-all', fontSize: '0.8rem', border: '1px solid var(--border)' }}>
              {shareUrl}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={copy}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button className="btn-ghost" onClick={onClose}>Done</button>
            </div>
            <p className="muted" style={{ fontSize: '0.75rem' }}>
              To revoke this link, go to your shares list and click Revoke.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
