/**
 * SuperTokens frontend initialisation.
 *
 * Call `initSupertokens()` once at app startup (before any rendering).
 * Uses EmailPassword recipe — gives us a pre-built login/register UI
 * that we render at /auth/* routes.
 *
 * After a successful login, SuperTokens manages the session cookie.
 * The user is then prompted to connect Google Drive + enter their passphrase
 * to derive their encryption keys (handled by Setup/Unlock flows).
 */
import SuperTokens from 'supertokens-auth-react'
import EmailPassword from 'supertokens-auth-react/recipe/emailpassword'
import Session from 'supertokens-auth-react/recipe/session'

export function initSupertokens() {
  SuperTokens.init({
    appInfo: {
      appName: 'Picturefied',
      // The Cloudflare Worker URL — set via VITE_API_URL env var at build time
      apiDomain: import.meta.env.VITE_API_URL ?? 'http://localhost:8787',
      // The GitHub Pages URL — set via VITE_PUBLIC_URL env var at build time
      websiteDomain: import.meta.env.VITE_PUBLIC_URL ?? 'http://localhost:5173',
      apiBasePath: '/auth',
      websiteBasePath: '/auth',
    },
    recipeList: [
      EmailPassword.init({
        getRedirectionURL: async (context) => {
          if (context.action === 'SUCCESS' && context.newSessionCreated) {
            // After login/register, go to the Drive connection + passphrase flow
            return '/#/setup'
          }
          return undefined
        },
      }),
      Session.init({
        tokenTransferMethod: 'header', // better for cross-origin (Pages → Workers)
      }),
    ],
  })
}

export { SuperTokens }
export { default as EmailPassword } from 'supertokens-auth-react/recipe/emailpassword'
export { EmailPasswordPreBuiltUI } from 'supertokens-auth-react/recipe/emailpassword/prebuiltui'
export { default as Session } from 'supertokens-auth-react/recipe/session'
export { SessionAuth } from 'supertokens-auth-react/recipe/session'
