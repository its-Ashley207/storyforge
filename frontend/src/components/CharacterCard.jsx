/**
 * CharacterCard
 * Props:
 *   character {object}   — { name, role, description }
 *   onEdit    {function}
 *   onDelete  {function}
 */

const ROLE_COLORS = {
  hero:                { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e', border: 'rgba(34,197,94,0.25)' },
  villain:             { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: 'rgba(239,68,68,0.25)' },
  mentor:              { bg: 'rgba(124,106,247,0.12)', color: '#9585f8', border: 'rgba(124,106,247,0.3)' },
  sidekick:            { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  rival:               { bg: 'rgba(239,68,68,0.08)',  color: '#f87171', border: 'rgba(239,68,68,0.2)' },
  'love interest':     { bg: 'rgba(236,72,153,0.12)', color: '#f472b6', border: 'rgba(236,72,153,0.25)' },
  'anti-hero':         { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)' },
  'mysterious stranger':{ bg: 'rgba(124,106,247,0.08)',color: '#7c6af7', border: 'rgba(124,106,247,0.2)' },
  'comic relief':      { bg: 'rgba(245,158,11,0.08)', color: '#fbbf24', border: 'rgba(245,158,11,0.2)' },
}

function getRoleStyle(role) {
  if (!role) return {}
  const key = role.toLowerCase()
  return ROLE_COLORS[key] || { bg: 'var(--surface2)', color: 'var(--text-muted)', border: 'var(--border)' }
}

export default function CharacterCard({ character, onEdit, onDelete }) {
  const roleStyle = getRoleStyle(character.role)

  return (
    <div className="character-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <h3 className="character-card__name">{character.name}</h3>
        {character.role && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.15rem 0.55rem',
              borderRadius: '9999px',
              fontSize: '0.65rem',
              fontWeight: '600',
              letterSpacing: '0.04em',
              flexShrink: 0,
              background: roleStyle.bg,
              color: roleStyle.color,
              border: `1px solid ${roleStyle.border}`,
            }}
          >
            {character.role}
          </span>
        )}
      </div>

      {character.description && (
        <p className="character-card__desc">{character.description}</p>
      )}

      <div className="character-card__actions">
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={onEdit}
        >
          ✏ Edit
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1, color: 'var(--error)' }}
          onClick={onDelete}
        >
          🗑 Delete
        </button>
      </div>
    </div>
  )
}
