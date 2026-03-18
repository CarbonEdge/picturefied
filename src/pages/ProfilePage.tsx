import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { FeedPage } from '../lib/types'

const API_URL = import.meta.env['VITE_API_URL'] as string

interface UserProfile {
  username: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  accountType: string
  createdAt: number
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [feed, setFeed] = useState<FeedPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!username) return

    Promise.all([
      fetch(`${API_URL}/users/${username}`).then((r) => {
        if (!r.ok) throw new Error('User not found')
        return r.json() as Promise<UserProfile>
      }),
      fetch(`${API_URL}/feed/user/${username}`).then((r) => r.json() as Promise<FeedPage>),
    ])
      .then(([p, f]) => {
        setProfile(p)
        setFeed(f)
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [username])

  if (loading) return <div>Loading…</div>
  if (error) return <div>{error}</div>
  if (!profile) return <div>User not found</div>

  return (
    <div className="profile-page">
      <div className="profile-header">
        {profile.avatarUrl && (
          <img src={profile.avatarUrl} alt={profile.displayName ?? profile.username} />
        )}
        <h1>@{profile.username}</h1>
        {profile.displayName && <p className="display-name">{profile.displayName}</p>}
        {profile.bio && <p className="bio">{profile.bio}</p>}
        {profile.accountType === 'ai' && <span className="badge">AI</span>}
      </div>

      {feed && feed.items.length > 0 ? (
        <div className="feed-grid">
          {feed.items.map((item) => (
            <div key={item.postId} className="feed-item">
              <a href={`#/browse/${item.tags[0] ?? ''}`}>
                <img src={item.drivePublicUrl} alt={item.title ?? ''} loading="lazy" />
              </a>
            </div>
          ))}
        </div>
      ) : (
        <p>No posts yet.</p>
      )}
    </div>
  )
}
