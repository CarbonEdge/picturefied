import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow the crypto Web Worker to load libsodium WASM
  webpack(config) {
    config.experiments = { ...config.experiments, asyncWebAssembly: true }
    return config
  },
  // Strict CSP headers — prevents exfiltration of decrypted content
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval'",   // unsafe-eval needed for WASM
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data:",         // blob: for decrypted photo preview
              "connect-src 'self'",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',        value: 'no-referrer' },
        ],
      },
    ]
  },
}

export default nextConfig
