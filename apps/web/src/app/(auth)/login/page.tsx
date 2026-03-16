'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getSodium,
  deriveMasterSecret,
  decryptPrivateKeyBundle,
  fromBase64url,
} from '@picturefied/crypto'
import { auth as authApi, keys as keysApi, setTokens } from '@/lib/api'
import { useKeystore } from '@/lib/keystore'

export default function LoginPage() {
  const router = useRouter()
  const { setKeys } = useKeystore()

  const [handle,   setHandle]   = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await getSodium()

      // Step 1: Fetch Argon2id salt before sending password
      const { salt: saltB64 } = await authApi.getSalt(handle)
      const salt = fromBase64url(saltB64)

      // Step 2: Derive master secret client-side (never sent to server)
      const masterSecret = await deriveMasterSecret(password, salt)

      // Step 3: Authenticate
      const tokens = await authApi.login({ handle, password })
      setTokens(tokens)

      // Step 4: Fetch encrypted key bundle from server
      const { keys: serverKeys } = await keysApi.getMyKeys()
      if (!serverKeys) throw new Error('No keys found. Was this account set up correctly?')

      // Step 5: Decrypt private keys using master secret
      const bundle = {
        version:                    1,
        encryptedIdentityPrivateKey: fromBase64url(serverKeys.identity.encryptedPrivateKey),
        encryptedSigningPrivateKey:  fromBase64url(serverKeys.signing.encryptedPrivateKey),
        argon2Salt:                  salt,
      }
      const pubKeys = {
        identityPublicKey: fromBase64url(serverKeys.identity.publicKey),
        signingPublicKey:  fromBase64url(serverKeys.signing.publicKey),
      }

      const userKeyBundle = await decryptPrivateKeyBundle(bundle, pubKeys, masterSecret)

      // Step 6: Load keys into in-memory store (never persisted)
      setKeys(userKeyBundle, '', handle)

      // Zero master secret — no longer needed
      masterSecret.fill(0)

      router.push('/gallery')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-zinc-400 text-sm mt-1">picturefied</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm text-zinc-300">Handle</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourhandle"
              required
              autoComplete="username"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-zinc-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
              autoComplete="current-password"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
          </label>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 font-medium transition-colors"
          >
            {loading ? 'Unlocking keys…' : 'Sign in'}
          </button>

          <p className="text-center text-zinc-500 text-sm">
            No account?{' '}
            <a href="/register" className="text-white underline">Create one</a>
          </p>
        </form>
      </div>
    </div>
  )
}
