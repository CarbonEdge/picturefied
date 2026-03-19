import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../../lib/theme'
import { getStoredUser } from '../../lib/session'
import { IconGrid, IconSearch, IconPlus, IconPerson, IconSun, IconMoon } from './icons'

interface BottomNavProps {
  onUpload: () => void
}

export default function BottomNav({ onUpload }: BottomNavProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const user = getStoredUser()

  return (
    <>
      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <a href="#/gallery" className="mobile-topbar-logo grad-text">Picturefied</a>
        <button className="sidebar-theme" onClick={toggle} style={{ marginRight: 4 }}>
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        {user && (
          <a href={`#/u/${user.username}`} className="sidebar-avatar">
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : user.username[0]?.toUpperCase()
            }
          </a>
        )}
      </div>

      {/* Bottom tabs */}
      <nav className="bottom-nav">
        <button
          className={`bottom-nav-item${pathname === '/gallery' ? ' active' : ''}`}
          onClick={() => navigate('/gallery')}
        >
          <IconGrid active={pathname === '/gallery'} />
          <span>Gallery</span>
        </button>

        <button
          className={`bottom-nav-item${pathname.startsWith('/browse') ? ' active' : ''}`}
          onClick={() => navigate('/browse/trending')}
        >
          <IconSearch />
          <span>Search</span>
        </button>

        <button className="bottom-nav-upload" onClick={onUpload}>
          <IconPlus />
        </button>

        <button
          className={`bottom-nav-item${pathname === '/feed' ? ' active' : ''}`}
          onClick={() => navigate('/feed')}
        >
          <IconPerson />
          <span>Feed</span>
        </button>
      </nav>
    </>
  )
}
