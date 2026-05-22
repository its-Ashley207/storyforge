import { NavLink, useParams } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '', label: 'Story', icon: '📖', key: 'story' },
  { to: '/write', label: 'Write', icon: '✍️', key: 'write' },
  { to: '/adventure', label: 'Adventure', icon: '🗺️', key: 'adventure' },
  { to: '/chat', label: 'Chat', icon: '💬', key: 'chat' },
  { to: '/world', label: 'World', icon: '🌍', key: 'world' },
]

export default function NavBar({ storyId, active }) {
  const params = useParams()
  const sid = storyId || params.id

  return (
    <nav className="nav" role="navigation" aria-label="Story navigation">
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.key}
          to={`/stories/${sid}${item.to}`}
          end={item.to === ''}
          className={({ isActive }) =>
            `nav-item ${isActive || active === item.key ? 'active' : ''}`
          }
          aria-label={item.label}
        >
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
