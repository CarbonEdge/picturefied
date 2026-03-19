import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../../lib/theme'
import { getStoredUser } from '../../lib/session'
import { IconGrid, IconSearch, IconFeed, IconPlus, IconSun, IconMoon } from './icons'

interface SidebarProps {
  onUpload: () => void
}

export default function Sidebar({ onUpload }: SidebarProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const user = getStoredUser()

  return (
    <nav className="sidebar">
      <a href="#/gallery" className="sidebar-logo grad-text">P</a>

      <button
        className={`sidebar-icon${pathname === '/gallery' ? ' active' : ''}`}
        onClick={() => navigate('/gallery')}
        title="Gallery"
      >
        <IconGrid active={pathname === '/gallery'} />
      </button>

      <button
        className={`sidebar-icon${pathname.startsWith('/browse') ? ' active' : ''}`}
        onClick={() => navigate('/browse/trending')}
        title="Browse"
      >
        <IconSearch />
      </button>

      <button
        className={`sidebar-icon${pathname === '/feed' ? ' active' : ''}`}
        onClick={() => navigate('/feed')}
        title="Following"
      >
        <IconFeed />
      </button>

      <div className="sidebar-spacer" />

      <button className="sidebar-upload" onClick={onUpload} title="New post">
        <IconPlus />
      </button>

      {user && (
        <a
          href={`#/u/${user.username}`}
          className="sidebar-avatar"
          title={`@${user.username}`}
        >
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : user.username[0]?.toUpperCase()
          }
        </a>
      )}

      <button className="sidebar-theme" onClick={toggle} title="Toggle theme">
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
    </nav>
  )
}
