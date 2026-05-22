import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import NavBar from '../components/NavBar.jsx'

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

export default function StoryDetail() {
  const { id } = useParams()
  const { apiKey, baseUrl } = useApp()
  const navigate = useNavigate()

  const [story, setStory]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [expandedCh, setExpandedCh] = useState(null)
  const [deleting, setDeleting]   = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exportLoading, setExportLoading] = useState('')

  const fetchStory = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${baseUrl}/api/stories/${id}`, {
        headers: { 'X-API-Key': apiKey },
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setStory(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, apiKey, baseUrl])

  useEffect(() => { fetchStory() }, [fetchStory])

  async function handleDelete() {
    if (!window.confirm('Delete this story? This cannot be undone.')) return
    setDeleting(true)
    try {
      await fetch(`${baseUrl}/api/stories/${id}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey },
      })
      navigate('/', { replace: true })
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  async function handleExport(format) {
    setExportLoading(format)
    try {
      const res = await fetch(`${baseUrl}/api/stories/${id}/export?format=${format}`, {
        headers: { 'X-API-Key': apiKey },
      })
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${story?.title || 'story'}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setShowExport(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setExportLoading('')
    }
  }

  if (loading) {
    return (
      <div className="page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner spinner-lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page" style={{ padding: 'var(--space-6)', alignItems: 'center', justifyContent: 'center' }}>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-ghost" style={{ marginTop: 'var(--space-4)' }} onClick={() => navigate('/')}>← Home</button>
      </div>
    )
  }

  const chapCount  = story?.chapters?.length ?? 0
  const totalChaps = story?.total_chapters ?? 0
  const progress   = totalChaps > 0 ? Math.round((chapCount / totalChaps) * 100) : 0
  const isComplete = chapCount >= totalChaps && totalChaps > 0

  return (
    <div className="page">
      {/* Header */}
      <header className="page-header">
        <button className="header-back" onClick={() => navigate('/')} aria-label="Back">←</button>
        <span className="header-title truncate">{story?.title}</span>
      </header>

      <div className="page-content">
        {/* Story hero */}
        <div
          className={`${getGenreClass(story?.genre)}`}
          style={{
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-6)',
            marginBottom: 'var(--space-5)',
            border: '1px solid var(--border)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
              {story?.genre && <span className="badge badge-primary">{story.genre}</span>}
              {story?.tone && <span className="badge badge-muted">{story.tone}</span>}
              {isComplete && <span className="badge badge-success">Complete</span>}
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--text-2xl)',
                fontWeight: 'var(--fw-semi)',
                color: 'var(--text)',
                lineHeight: 1.25,
                marginBottom: 'var(--space-4)',
              }}
            >
              {story?.title}
            </h1>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'rgba(228, 230, 240, 0.7)',
                lineHeight: 1.6,
                marginBottom: 'var(--space-4)',
              }}
            >
              {story?.premise?.slice(0, 200)}{story?.premise?.length > 200 ? '…' : ''}
            </p>
            {/* Progress */}
            <div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-label">
                <span>{chapCount} / {totalChaps} chapters</span>
                <span>{progress}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/stories/${id}/write`)}
          >
            ✍️ Write
          </button>
          <button
            className="btn btn-surface"
            onClick={() => navigate(`/stories/${id}/adventure`)}
          >
            🗺️ Adventure
          </button>
          <button
            className="btn btn-surface"
            onClick={() => navigate(`/stories/${id}/chat`)}
          >
            💬 Chat
          </button>
          <button
            className="btn btn-surface"
            onClick={() => navigate(`/stories/${id}/world`)}
          >
            🌍 World
          </button>
        </div>

        {/* Chapters */}
        {chapCount > 0 ? (
          <div>
            <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
              Chapters
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {story.chapters.map((ch, i) => (
                <div key={i} className="chapter-item">
                  <div
                    className="chapter-item__header"
                    onClick={() => setExpandedCh(expandedCh === i ? null : i)}
                  >
                    <span className="chapter-item__number">{ch.chapter_number ?? i + 1}</span>
                    <span className="chapter-item__title">
                      {ch.title || `Chapter ${ch.chapter_number ?? i + 1}`}
                    </span>
                    <span className="chapter-item__meta">
                      {ch.content?.trim().split(/\s+/).length ?? 0}w
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                      {expandedCh === i ? '▲' : '▼'}
                    </span>
                  </div>
                  {expandedCh === i && (
                    <div className="chapter-item__content">{ch.content}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>✍️</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              No chapters yet. Start writing!
            </p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-4)' }}
              onClick={() => navigate(`/stories/${id}/write`)}
            >
              Write First Chapter
            </button>
          </div>
        )}

        {/* Bottom actions */}
        <div style={{ marginTop: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {chapCount > 0 && (
            <button
              className="btn btn-ghost btn-full"
              onClick={() => setShowExport(true)}
            >
              📥 Export Story
            </button>
          )}
          <button
            className="btn btn-danger btn-full"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <><span className="spinner spinner-sm" /> Deleting…</> : '🗑 Delete Story'}
          </button>
        </div>

        <div style={{ height: '2rem' }} />
      </div>

      {/* Export modal */}
      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">📥 Export Story</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
              Choose a format to download "{story?.title}"
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {[
                { fmt: 'txt', icon: '📄', label: 'Plain Text', desc: 'Simple .txt file' },
                { fmt: 'pdf', icon: '📋', label: 'PDF Document', desc: 'Formatted PDF' },
                { fmt: 'epub', icon: '📚', label: 'ePub eBook', desc: 'For e-readers' },
              ].map(({ fmt, icon, label, desc }) => (
                <button
                  key={fmt}
                  className="choice-btn"
                  onClick={() => handleExport(fmt)}
                  disabled={!!exportLoading}
                >
                  <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 'var(--fw-medium)', fontSize: 'var(--text-sm)' }}>{label}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{desc}</div>
                  </div>
                  {exportLoading === fmt && <span className="spinner spinner-sm" />}
                </button>
              ))}
            </div>
            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: 'var(--space-4)' }}
              onClick={() => setShowExport(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <NavBar storyId={id} active="story" />
    </div>
  )
}
