/**
 * Google Sign-In wrapper using Google Identity Services (GIS).
 *
 * Handles One Tap and Sign-In button flows.
 * Returns Google ID tokens (JWTs) for verification by the Worker.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfig) => void
          prompt: (notification?: (n: PromptNotification) => void) => void
          renderButton: (element: HTMLElement, config: ButtonConfig) => void
          disableAutoSelect: () => void
          revoke: (hint: string, done: () => void) => void
        }
      }
    }
  }
}

interface GoogleIdConfig {
  client_id: string
  callback: (response: CredentialResponse) => void
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
}

interface CredentialResponse {
  credential: string
  select_by: string
}

interface PromptNotification {
  isNotDisplayed: () => boolean
  isSkippedMoment: () => boolean
  isDismissedMoment: () => boolean
}

interface ButtonConfig {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with'
  shape?: 'rectangular' | 'pill'
  width?: number
}

const GIS_SDK_URL = 'https://accounts.google.com/gsi/client'

let sdkLoadPromise: Promise<void> | null = null

export function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SDK_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })

  return sdkLoadPromise
}

export type SignInCallback = (credential: string) => void

export function initializeGoogleSignIn(
  clientId: string,
  callback: SignInCallback,
  options?: { autoSelect?: boolean },
): void {
  if (!window.google?.accounts?.id) {
    throw new Error('Google Identity Services not loaded')
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => callback(response.credential),
    auto_select: options?.autoSelect ?? false,
    cancel_on_tap_outside: true,
  })
}

export function promptOneTap(): void {
  window.google?.accounts.id.prompt()
}

export function renderSignInButton(element: HTMLElement, config?: ButtonConfig): void {
  window.google?.accounts.id.renderButton(element, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    ...config,
  })
}

export function revokeGoogleSession(hint: string): Promise<void> {
  return new Promise((resolve) => {
    window.google?.accounts.id.disableAutoSelect()
    window.google?.accounts.id.revoke(hint, resolve)
  })
}
