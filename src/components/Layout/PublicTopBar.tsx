import { useTheme } from '../../lib/theme'
import { IconSun, IconMoon } from './icons'

export default function PublicTopBar() {
  const { theme, toggle } = useTheme()
  return (
    <div className="public-topbar">
      <a href="#/" className="public-topbar-logo grad-text">Picturefied</a>
      <div style={{ flex: 1 }} />
      <button className="sidebar-theme" onClick={toggle} aria-label="Toggle theme">
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
    </div>
  )
}
