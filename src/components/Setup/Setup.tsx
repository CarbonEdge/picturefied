/**
 * Setup flow — shown on first visit.
 *
 * Steps:
 *   1. Connect Google Drive (OAuth)
 *   2. Choose passphrase
 *   3. Derive keys + generate Argon2 salt
 *   4. Encrypt keypair → config.enc → Drive
 *   5. Show 24-word recovery phrase
 *   6. Confirm one word → done
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getSodium,
  deriveMasterSecret,
  deriveUserKeys,
  generateArgon2Salt,
  encryptKeyBundle,
  masterSecretToMnemonic,
  toBase64url,
} from '../../lib/crypto'
import { DriveAdapter, requestDriveToken } from '../../lib/storage/gdrive'
import { IndexManager, deriveIndexKey } from '../../lib/index-manager'
import { useKeystore } from '../../lib/keystore'

type Step = 'drive' | 'passphrase' | 'generating' | 'phrase' | 'confirm'

export default function Setup() {
  const [step, setStep]         = useState<Step>('drive')
  const [token, setToken]       = useState<string>('')
  const [passphrase, setPass]   = useState('')
  const [confirm, setConfirm]   = useState('')
  const [mnemonic, setMnemonic] = useState<string[]>([])
  const [confirmIdx, setConfirmIdx] = useState(0)
  const [confirmInput, setConfirmInput] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)

  const setSession = useKeystore((s) => s.setSession)
  const navigate   = useNavigate()

  // Step 1 — connect Drive
  async function connectDrive() {
    setBusy(true)
    setError(null)
    try {
      const t = await requestDriveToken()
      setToken(t)
      setStep('passphrase')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Step 2 — submit passphrase
  async function submitPassphrase() {
    if (passphrase.length < 12) {
      setError('Passphrase must be at least 12 characters.')
      return
    }
    if (passphrase !== confirm) {
      setError('Passphrases do not match.')
      return
    }
    setError(null)
    setStep('generating')
    setBusy(true)

    try {
      await getSodium() // ensure WASM loaded

      const salt          = await generateArgon2Salt()
      const masterSecret  = await deriveMasterSecret(passphrase, salt)
      const keys          = await deriveUserKeys(masterSecret)
      const encKeyBundle  = await encryptKeyBundle(keys, masterSecret)
      const words         = await masterSecretToMnemonic(masterSecret)

      // Write config.enc to Drive
      const drive = new DriveAdapter(token)

      // config.enc = JSON { version, argon2Salt, encryptedKeyBundle }
      const configObj = {
        version: 1,
        argon2Salt: toBase64url(salt),
        encryptedKeyBundle: toBase64url(encKeyBundle),
      }
      const configBytes = new TextEncoder().encode(JSON.stringify(configObj))
      await drive.writeConfig(configBytes)

      // Build IndexManager
      const indexKey    = await deriveIndexKey(masterSecret)
      const indexMgr    = new IndexManager(drive, indexKey)
      await indexMgr.load() // creates empty index.enc

      // Zero master secret
      masterSecret.fill(0)
      salt.fill(0)
      encKeyBundle.fill(0)

      setMnemonic(words.split(' '))
      setConfirmIdx(Math.floor(Math.random() * 24))
      setSession(keys, drive, indexMgr)
      setStep('phrase')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('passphrase')
    } finally {
      setBusy(false)
    }
  }

  // Step 3 — confirm one word from phrase
  function confirmWord() {
    const expected = mnemonic[confirmIdx]
    if (confirmInput.trim().toLowerCase() !== expected) {
      setError(`That's not word #${confirmIdx + 1}. Check your phrase and try again.`)
      return
    }
    navigate('/gallery', { replace: true })
  }

  // ─── Renders ────────────────────────────────────────────────────────────────

  if (step === 'drive') {
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: 440, width: '100%' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Welcome to Picturefied</h1>
          <p className="muted" style={{ marginBottom: '1.5rem' }}>
            Private photo sharing — your files, encrypted, on your Google Drive.
            No middleman. No servers holding your data.
          </p>
          <button className="btn-primary" style={{ width: '100%' }} onClick={connectDrive} disabled={busy}>
            {busy ? 'Opening Google sign-in…' : 'Connect Google Drive'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    )
  }

  if (step === 'passphrase') {
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: 440, width: '100%' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Choose a passphrase</h2>
          <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            This is your encryption key. It never leaves your device. Use something long — at
            least 12 characters. You'll also get a 24-word recovery phrase as a backup.
          </p>
          <div className="form-stack">
            <div>
              <label className="label">Passphrase</label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPass(e.target.value)}
                placeholder="At least 12 characters"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Confirm passphrase</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat passphrase"
                onKeyDown={(e) => e.key === 'Enter' && submitPassphrase()}
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn-primary" onClick={submitPassphrase} disabled={busy}>
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'generating') {
    return (
      <div className="center-page">
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: '0.5rem' }}>Generating your keys…</p>
          <p className="muted" style={{ fontSize: '0.875rem' }}>
            Argon2id is running (~2 seconds). This is intentionally slow.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'phrase') {
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: 560, width: '100%' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Your recovery phrase</h2>
          <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
            Write these 24 words on paper and store them somewhere safe. If you forget your
            passphrase, this is the only way to recover your account. Your encrypted files are
            permanently unrecoverable without it.
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.5rem', marginBottom: '1.5rem',
          }}>
            {mnemonic.map((word, i) => (
              <div key={i} style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '0.4em 0.6em', fontSize: '0.8rem',
              }}>
                <span className="muted" style={{ marginRight: '0.4em', fontSize: '0.7rem' }}>{i + 1}.</span>
                {word}
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{ width: '100%' }} onClick={() => setStep('confirm')}>
            I've written it down
          </button>
        </div>
      </div>
    )
  }

  // confirm step
  return (
    <div className="center-page">
      <div className="card" style={{ maxWidth: 440, width: '100%' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Confirm your phrase</h2>
        <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          Enter word #{confirmIdx + 1} from your recovery phrase:
        </p>
        <div className="form-stack">
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={`Word #${confirmIdx + 1}`}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && confirmWord()}
          />
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" onClick={confirmWord}>
            Continue to gallery
          </button>
        </div>
      </div>
    </div>
  )
}
