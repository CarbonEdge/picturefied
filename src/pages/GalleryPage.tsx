import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Uploader from '../components/Uploader/Uploader'
import { getSessionToken, clearSession, getStoredUser } from '../lib/session'

const API_URL = import.meta.env['VITE_API_URL'] as string

interface Post {
  id: string
  driveFileId: string
  drivePublicUrl: string | null
  title: string | null
  tags: string[]
  isPublic: boolean
  createdAt: number
}

export default function GalleryPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const user = getStoredUser()

  useEffect(() => {
    const token = getSessionToken()
    if (!token) return
    fetch(`${API_URL}/posts/mine`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { posts: Post[] }) => {
        setPosts(data.posts)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function handleUploaded(post: Post) {
    setPosts((prev) => [post, ...prev])
  }

  function logout() {
    clearSession()
    navigate('/', { replace: true })
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem', flex: 1 }}>Picturefied</h1>
        {user && <span className="muted" style={{ fontSize: '0.875rem' }}>@{user.username}</span>}
        <button className="btn-ghost" style={{ fontSize: '0.85rem' }} onClick={logout}>
          Sign out
        </button>
      </header>

      <div style={{ marginBottom: '1.5rem' }}>
        <Uploader onUploaded={handleUploaded} />
      </div>

      {loading ? (
        <p className="muted" style={{ textAlign: 'center', padding: '2rem' }}>Loading…</p>
      ) : posts.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No posts yet. Upload something!</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1rem',
        }}>
          {posts.map((post) => (
            <div key={post.id} style={{
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
            }}>
              {post.drivePublicUrl ? (
                <img
                  src={post.drivePublicUrl}
                  alt={post.title ?? ''}
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{
                  aspectRatio: '1',
                  background: 'var(--bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>Private</span>
                </div>
              )}
              {post.title && (
                <div style={{ padding: '0.5rem', fontSize: '0.8rem' }}>{post.title}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
