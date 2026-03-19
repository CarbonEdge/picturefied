import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { isAuthenticated, getSessionToken } from '../lib/session'
import type { FeedPage } from '../lib/types'
import AppShell from '../components/Layout/AppShell'

const API_URL = import.meta.env['VITE_API_URL'] as string

export default function FeedPage() {
  const [feed, setFeed] = useState<FeedPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const authed = isAuthenticated()

  useEffect(() => {
    if (!authed) return

    const token = getSessionToken()
    fetch(`${API_URL}/feed/following`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json() as Promise<FeedPage>)
      .then(setFeed)
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [authed])

  if (!authed) return <Navigate to="/auth" replace />
  if (loading) return <div>Loading…</div>
  if (error) return <div>Error: {error}</div>
  if (!feed) return null

  return (
    <AppShell>
      <div className="feed-page">
        <h1>Following</h1>
        {feed.items.length === 0 ? (
          <p style={{ padding: '2rem 20px', color: 'var(--muted)' }}>
            Follow people to see their posts here.
          </p>
        ) : (
          <div className="feed-grid">
            {feed.items.map((item) => (
              <div key={item.postId} className="feed-item">
                <img src={item.drivePublicUrl} alt={item.title ?? ''} loading="lazy" />
                <div className="feed-item-meta">
                  <a href={`#/u/${item.authorUsername}`}>@{item.authorUsername}</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
