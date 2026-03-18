import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  initializeGoogleSignIn,
  renderSignInButton,
  promptOneTap,
  revokeGoogleSession,
} from '../lib/auth'

function mockGoogleAccounts() {
  const id = {
    initialize: vi.fn(),
    prompt: vi.fn(),
    renderButton: vi.fn(),
    disableAutoSelect: vi.fn(),
    revoke: vi.fn((_hint: string, done: () => void) => done()),
  }

  Object.defineProperty(window, 'google', {
    value: { accounts: { id } },
    writable: true,
    configurable: true,
  })

  return id
}

describe('initializeGoogleSignIn', () => {
  beforeEach(() => mockGoogleAccounts())
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).google
  })

  it('calls google.accounts.id.initialize with the client ID', () => {
    const cb = vi.fn()
    initializeGoogleSignIn('my-client-id', cb)
    expect(window.google!.accounts.id.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'my-client-id' }),
    )
  })

  it('wraps the callback so it receives the credential string', () => {
    let captured = ''
    initializeGoogleSignIn('cid', (cred) => {
      captured = cred
    })

    // Simulate GIS calling back with { credential }
    const initCall = (window.google!.accounts.id.initialize as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { callback: (r: { credential: string }) => void },
    ]
    initCall[0].callback({ credential: 'test-jwt' })
    expect(captured).toBe('test-jwt')
  })

  it('throws when GIS SDK is not loaded', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).google
    expect(() => initializeGoogleSignIn('cid', vi.fn())).toThrow(
      'Google Identity Services not loaded',
    )
  })
})

describe('renderSignInButton', () => {
  beforeEach(() => mockGoogleAccounts())
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).google
  })

  it('renders button in the provided element', () => {
    const el = document.createElement('div')
    renderSignInButton(el)
    expect(window.google!.accounts.id.renderButton).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ type: 'standard' }),
    )
  })

  it('merges custom config options', () => {
    const el = document.createElement('div')
    renderSignInButton(el, { theme: 'filled_blue', size: 'small' })
    expect(window.google!.accounts.id.renderButton).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ theme: 'filled_blue', size: 'small' }),
    )
  })
})

describe('promptOneTap', () => {
  it('calls google.accounts.id.prompt when GIS is available', () => {
    const id = mockGoogleAccounts()
    promptOneTap()
    expect(id.prompt).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).google
  })

  it('does not throw when GIS is not loaded', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).google
    expect(() => promptOneTap()).not.toThrow()
  })
})

describe('revokeGoogleSession', () => {
  it('calls disableAutoSelect then revoke', async () => {
    const id = mockGoogleAccounts()
    await revokeGoogleSession('user@example.com')
    expect(id.disableAutoSelect).toHaveBeenCalled()
    expect(id.revoke).toHaveBeenCalledWith('user@example.com', expect.any(Function))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).google
  })
})
