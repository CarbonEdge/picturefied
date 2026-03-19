import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { FeedPage } from '../lib/types'
import PublicTopBar from '../components/Layout/PublicTopBar'

const API_URL = import.meta.env['VITE_API_URL'] as string

export default function BrowsePage() {
  const { tag } = useParams<{ tag: string }>()
  const [feed, setFeed] = useState<FeedPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tag) return

    setLoading(true)
    fetch(`${API_URL}/feed/tag/${encodeURIComponent(tag)}`)
      .then((r) => r.json() as Promise<FeedPage>)
      .then(setFeed)
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [tag])

  if (loading) return <div>Loading…</div>
  if (error) return <div>Error: {error}</div>
  if (!feed) return null

  return (
    <div className="browse-page">
      <PublicTopBar />
      <h1>#{tag}</h1>
      {feed.items.length === 0 ? (
        <p style={{ padding: '2rem 20px', color: 'var(--muted)' }}>No posts yet for #{tag}</p>
      ) : (
        <div className="feed-grid">
          {feed.items.map((item) => (
            <div key={item.postId} className="feed-item">
              <img src={item.drivePublicUrl} alt={item.title ?? `#${tag}`} loading="lazy" />
              <div className="feed-item-meta">
                <a href={`#/u/${item.authorUsername}`}>@{item.authorUsername}</a>
                <div className="tags">
                  {item.tags.map((t) => (
                    <a key={t} href={`#/browse/${t}`}>#{t}</a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
