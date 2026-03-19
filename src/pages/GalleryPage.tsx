import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/Layout/AppShell'
import { getSessionToken, clearSession, getStoredUser } from '../lib/session'
import type { Post } from '../lib/types'
import { IconGrid, IconFeed } from '../components/Layout/icons'

const API_URL = import.meta.env['VITE_API_URL'] as string

export default function GalleryPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const user = getStoredUser()

  useEffect(() => {
    const token = getSessionToken()
    if (!token) { setLoading(false); return }
    fetch(`${API_URL}/posts/mine`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { posts: Post[] }) => {
        setPosts(data.posts)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load posts')
        setLoading(false)
      })
  }, [])

  function handleUploaded(post: Post) {
    setPosts((prev) => [post, ...prev])
  }

  function logout() {
    clearSession()
    navigate('/', { replace: true })
  }

  return (
    <AppShell onPostUploaded={handleUploaded}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Profile header */}
        <div className="profile-section">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar-inner">
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '👤'
              }
            </div>
          </div>
          <div className="profile-info">
            <h2>@{user?.username ?? '…'}</h2>
            <div className="profile-stats">
              <div className="profile-stat">
                <div className="profile-stat-num">{posts.length}</div>
                <div className="profile-stat-label">posts</div>
              </div>
            </div>
            <button className="btn-ghost" style={{ fontSize: '0.8rem', marginTop: 4 }} onClick={logout}>
              Sign out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="page-tabs">
          <button className="page-tab active">
            <IconGrid active />
            My Posts
          </button>
          <button className="page-tab" onClick={() => navigate('/feed')}>
            <IconFeed />
            Feed
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <p className="muted" style={{ textAlign: 'center', padding: '3rem' }}>Loading…</p>
        ) : error ? (
          <p className="error" style={{ textAlign: 'center', padding: '3rem' }}>{error}</p>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <p>No posts yet.</p>
            <p style={{ fontSize: '0.8rem' }}>Tap the + button to share your first photo.</p>
          </div>
        ) : (
          <div className="photo-grid">
            {posts.map((post) => (
              <div key={post.id} className="photo-cell">
                {post.drivePublicUrl
                  ? <img src={post.drivePublicUrl} alt={post.title ?? ''} loading="lazy" />
                  : <div className="photo-cell-private">Private</div>
                }
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
