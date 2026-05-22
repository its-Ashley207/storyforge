/**
 * StoryCard
 * Props:
 *   story   {object}  — story data from API
 *   onClick {function} — click handler
 */

function getGenreClass(genre) {
  if (!genre) return 'genre-default'
  const g = genre.toLowerCase()
  if (g.includes('fantasy')) return 'genre-fantasy'
  if (g.includes('sci') || g.includes('space') || g.includes('cyber')) return 'genre-scifi'
  if (g.includes('mystery') || g.includes('thriller')) return 'genre-mystery'
  if (g.includes('romance')) return 'genre-romance'
  if (g.includes('horror')) return 'genre-horror'
  if (g.includes('adventure')) return 'genre-adventure'
  return 'genre-default'
}

function getGenreEmoji(genre) {
  if (!genre) return '📖'
  const g = genre.toLowerCase()
  if (g.includes('fantasy')) return '⚔️'
  if (g.includes('sci-fi') || g.includes('space')) return '🚀'
  if (g.includes('cyber')) return '🤖'
  if (g.includes('mystery')) return '🔍'
  if (g.includes('thriller')) return '🎭'
  if (g.includes('romance')) return '💕'
  if (g.includes('horror')) return '👻'
  if (g.includes('adventure')) return '🗺️'
  if (g.includes('historical')) return '🏛️'
  if (g.includes('literary')) return '📚'
  return '📖'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export default function StoryCard({ story, onClick }) {
  const chapCount  = story.chapters?.length ?? story.chapter_count ?? 0
  const totalChaps = story.total_chapters ?? 0
  const progress   = totalChaps > 0 ? Math.round((chapCount / totalChaps) * 100) : 0
  const isComplete = chapCount >= totalChaps && totalChaps > 0

  return (
    <div className="story-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick?.()}>
      {/* Gradient header */}
      <div className={`story-card__header ${getGenreClass(story.genre)}`}>
        <div className="story-card__header-icon">
          {getGenreEmoji(story.genre)}
        </div>
      </div>

      {/* Body */}
      <div className="story-card__body">
        <h3 className="story-card__title">{story.title}</h3>

        {/* Tags */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {story.genre && (
            <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>
              {story.genre}
            </span>
          )}
          {isComplete && (
            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
              Complete
            </span>
          )}
        </div>

        {/* Progress */}
        {totalChaps > 0 && (
          <div className="story-card__progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-label">
              <span>{chapCount}/{totalChaps} ch</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}

        {/* Date */}
        <div className="story-card__meta" style={{ marginTop: '8px' }}>
          <span className="story-card__date">
            {formatDate(story.created_at || story.updated_at)}
          </span>
        </div>
      </div>
    </div>
  )
}
