import { useEffect, useRef } from 'react'
import {
  loadGoogleIdentityServices,
  initializeGoogleSignIn,
  renderSignInButton,
} from '../../lib/auth'
import { exchangeGoogleToken, saveSession } from '../../lib/session'
import type { StoredUser } from '../../lib/session'

const GOOGLE_CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string
const API_URL = import.meta.env['VITE_API_URL'] as string

interface SignInProps {
  onSuccess: (user: StoredUser, isNewUser: boolean) => void
  onError?: (error: Error) => void
}

export function SignIn({ onSuccess, onError }: SignInProps) {
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    loadGoogleIdentityServices()
      .then(() => {
        if (!mounted) return
        initializeGoogleSignIn(GOOGLE_CLIENT_ID, async (credential) => {
          try {
            const result = await exchangeGoogleToken(credential, API_URL)
            saveSession(result.sessionToken, result.user)
            onSuccess(result.user, result.isNewUser)
          } catch (err) {
            onError?.(err instanceof Error ? err : new Error(String(err)))
          }
        })
        if (buttonRef.current) renderSignInButton(buttonRef.current)
      })
      .catch((err: unknown) => {
        onError?.(err instanceof Error ? err : new Error(String(err)))
      })
    return () => { mounted = false }
  }, [onSuccess, onError])

  return (
    <div className="center-page">
      <div className="auth-card">
        <div className="auth-logo grad-text">Picturefied</div>
        <p className="auth-tagline">Share your world. Keep what's yours.</p>
        <div style={{ width: '100%', height: 1, background: 'var(--border)' }} />
        <div ref={buttonRef} style={{ width: '100%' }} />
      </div>
    </div>
  )
}
