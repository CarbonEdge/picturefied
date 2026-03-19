import { useState } from 'react'
import { getSessionToken } from '../../lib/session'
import type { StoredUser } from '../../lib/session'

const API_URL = import.meta.env['VITE_API_URL'] as string

const USERNAME_RE = /^[a-z0-9_]{3,30}$/

interface UsernameRegistrationProps {
  onSuccess: (user: StoredUser) => void
  onError?: (error: Error) => void
}

export function UsernameRegistration({ onSuccess, onError }: UsernameRegistrationProps) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isValid = USERNAME_RE.test(username)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) {
      setError('3-30 chars: lowercase letters, numbers, underscores only')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const token = getSessionToken()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`${API_URL}/users/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      })

      if (!response.ok) {
        const err = (await response.json()) as { error: string }
        throw new Error(err.error ?? 'Failed to register username')
      }

      const user = (await response.json()) as StoredUser
      onSuccess(user)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e.message)
      onError?.(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="center-page">
      <div className="auth-card">
        <div className="auth-logo grad-text">Picturefied</div>
        <p className="auth-tagline">One last step — choose your username.</p>
        <form onSubmit={handleSubmit} className="form-stack" style={{ width: '100%' }}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="username"
            minLength={3}
            maxLength={30}
            required
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading || !isValid}>
            {loading ? 'Setting up…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
