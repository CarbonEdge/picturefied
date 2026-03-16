'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getSodium,
  generateUserKeys,
  generateArgon2Salt,
  deriveMasterSecret,
  encryptPrivateKeyBundle,
  masterSecretToMnemonic,
  toBase64url,
} from '@picturefied/crypto'
import { auth as authApi, keys as keysApi, setTokens } from '@/lib/api'
import { useKeystore } from '@/lib/keystore'

type Step = 'details' | 'recovery' | 'confirm'

export default function RegisterPage() {
  const router = useRouter()
  const { setKeys } = useKeystore()

  const [step,     setStep]     = useState<Step>('details')
  const [handle,   setHandle]   = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [mnemonic, setMnemonic] = useState<string[]>([])
  const [userConfirmWord, setUserConfirmWord] = useState('')
  const [confirmIndex,    setConfirmIndex]    = useState(0)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // Stored in closure until final submit
  const [pendingData, setPendingData] = useState<{
    masterSecret: Uint8Array
    userKeyBundle: Awaited<ReturnType<typeof generateUserKeys>>
    argon2Salt: Uint8Array
  } | null>(null)

  async function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 12)  { setError('Password must be at least 12 characters'); return }

    setLoading(true)
    try {
      await getSodium()
      const argon2Salt  = await generateArgon2Salt()
      const masterSecret = await deriveMasterSecret(password, argon2Salt)
      const userKeyBundle = await generateUserKeys()
      const words = masterSecretToMnemonic(masterSecret).split(' ')

      setPendingData({ masterSecret, userKeyBundle, argon2Salt })
      setMnemonic(words)
      // Pick a random word for confirmation
      setConfirmIndex(Math.floor(Math.random() * words.length))
      setStep('recovery')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleFinalSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingData) return
    setError('')

    // Verify the user has actually read the recovery phrase
    const expected = mnemonic[confirmIndex]
    if (userConfirmWord.trim().toLowerCase() !== expected) {
      setError(`Incorrect. Word #${confirmIndex + 1} should be "${expected}". Please re-read your phrase.`)
      return
    }

    setLoading(true)
    try {
      const { masterSecret, userKeyBundle, argon2Salt } = pendingData

      // Encrypt private keys with master secret
      const bundle = await encryptPrivateKeyBundle(userKeyBundle, masterSecret, argon2Salt)

      // Register with the API
      const tokens = await authApi.register({
        handle,
        email: email || undefined,
        password,
        argon2Salt: toBase64url(argon2Salt),
      })
      setTokens(tokens)

      // Upload public keys + encrypted private key bundle
      await keysApi.putMyKeys({
        identity: {
          publicKey:           toBase64url(userKeyBundle.identity.publicKey),
          encryptedPrivateKey: toBase64url(bundle.encryptedIdentityPrivateKey),
        },
        signing: {
          publicKey:           toBase64url(userKeyBundle.signing.publicKey),
          encryptedPrivateKey: toBase64url(bundle.encryptedSigningPrivateKey),
        },
      })

      // Load keys into memory
      setKeys(userKeyBundle, /* userId from JWT */ '', handle)
      router.push('/gallery')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Create account</h1>
          <p className="text-zinc-400 text-sm mt-1">picturefied</p>
        </div>

        {step === 'details' && (
          <form onSubmit={handleDetailsSubmit} className="space-y-4">
            <Field label="Handle" type="text" value={handle} onChange={setHandle}
              placeholder="yourhandle" pattern="[a-z0-9_]+" required />
            <Field label="Email (optional)" type="email" value={email} onChange={setEmail}
              placeholder="you@example.com" />
            <Field label="Password" type="password" value={password} onChange={setPassword}
              placeholder="12+ characters" required />
            <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm}
              placeholder="Same password again" required />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 font-medium transition-colors">
              {loading ? 'Generating keys…' : 'Continue'}
            </button>

            <p className="text-center text-zinc-500 text-sm">
              Already have an account? <a href="/login" className="text-white underline">Sign in</a>
            </p>
          </form>
        )}

        {step === 'recovery' && (
          <form onSubmit={handleFinalSubmit} className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium">Save your recovery phrase</p>
              <p className="text-zinc-400 text-xs">
                These 24 words are the only way to recover your account if you forget your
                password. Write them down and store them somewhere safe.{' '}
                <strong className="text-white">If you lose this phrase and forget your password, your files cannot be recovered.</strong>
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {mnemonic.map((word, i) => (
                  <div key={i} className="bg-zinc-800 rounded px-2 py-1 text-xs font-mono">
                    <span className="text-zinc-600 mr-1">{i + 1}.</span>
                    {word}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm text-zinc-300">
                Confirm word #{confirmIndex + 1} from your phrase
              </label>
              <input
                type="text"
                value={userConfirmWord}
                onChange={(e) => setUserConfirmWord(e.target.value)}
                placeholder={`Enter word #${confirmIndex + 1}`}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                required
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 font-medium transition-colors">
              {loading ? 'Creating account…' : "I've saved my phrase — create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Field({
  label, type, value, onChange, placeholder, pattern, required,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  pattern?: string
  required?: boolean
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        pattern={pattern}
        required={required}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
      />
    </label>
  )
}
