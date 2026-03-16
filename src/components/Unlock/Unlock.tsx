/**
 * Unlock flow — shown on return visits.
 *
 * Steps:
 *   1. Connect Google Drive (OAuth — needed to read config.enc)
 *   2. Enter passphrase → Argon2id → decrypt keys → load index
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deriveMasterSecret,
  decryptKeyBundle,
  fromBase64url,
  getSodium,
} from '../../lib/crypto'
import { DriveAdapter, requestDriveToken } from '../../lib/storage/gdrive'
import { IndexManager, deriveIndexKey } from '../../lib/index-manager'
import { useKeystore } from '../../lib/keystore'

type Step = 'drive' | 'passphrase' | 'unlocking'

interface StoredConfig {
  version: number
  argon2Salt: string
  encryptedKeyBundle: string
}

export default function Unlock() {
  const [step, setStep]       = useState<Step>('drive')
  const [drive, setDrive]     = useState<DriveAdapter | null>(null)
  const [config, setConfig]   = useState<StoredConfig | null>(null)
  const [passphrase, setPass] = useState('')
  const [error, setError]     = useState<string | null>(null)
  const [busy, setBusy]       = useState(false)

  const setSession = useKeystore((s) => s.setSession)
  const navigate   = useNavigate()

  async function connectDrive() {
    setBusy(true)
    setError(null)
    try {
      await getSodium()
      const token   = await requestDriveToken()
      const adapter = new DriveAdapter(token)

      const configBytes = await adapter.readConfig()
      if (!configBytes) {
        // No config found — redirect to setup
        navigate('/setup', { replace: true })
        return
      }

      const cfg = JSON.parse(new TextDecoder().decode(configBytes)) as StoredConfig
      setDrive(adapter)
      setConfig(cfg)
      setStep('passphrase')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function unlock() {
    if (!drive || !config) return
    if (!passphrase) { setError('Enter your passphrase.'); return }

    setError(null)
    setStep('unlocking')
    setBusy(true)

    try {
      const salt         = fromBase64url(config.argon2Salt)
      const masterSecret = await deriveMasterSecret(passphrase, salt)
      const encBundle    = fromBase64url(config.encryptedKeyBundle)
      const keys         = await decryptKeyBundle(encBundle, masterSecret)

      const indexKey = await deriveIndexKey(masterSecret)
      masterSecret.fill(0)

      const indexMgr = new IndexManager(drive, indexKey)
      await indexMgr.load()
      await indexMgr.pruneExpiredShares()

      setSession(keys, drive, indexMgr)
      navigate('/gallery', { replace: true })
    } catch (e) {
      setError('Wrong passphrase or corrupted config.')
      setStep('passphrase')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'drive') {
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: 440, width: '100%' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Welcome back</h1>
          <p className="muted" style={{ marginBottom: '1.5rem' }}>
            Connect your Google Drive to load your encrypted photos.
          </p>
          <button className="btn-primary" style={{ width: '100%' }} onClick={connectDrive} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Google Drive'}
          </button>
          {error && <p className="error">{error}</p>}
          <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            First time?{' '}
            <a href="#/setup" onClick={(e) => { e.preventDefault(); navigate('/setup') }}>
              Set up Picturefied
            </a>
          </p>
        </div>
      </div>
    )
  }

  if (step === 'passphrase' || step === 'unlocking') {
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: 440, width: '100%' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Enter passphrase</h2>
          <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            Your keys are decrypted locally. Nothing is sent to any server.
          </p>
          <div className="form-stack">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Your passphrase"
              disabled={step === 'unlocking'}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && unlock()}
            />
            {error && <p className="error">{error}</p>}
            <button className="btn-primary" onClick={unlock} disabled={step === 'unlocking'}>
              {step === 'unlocking' ? 'Decrypting keys…' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
