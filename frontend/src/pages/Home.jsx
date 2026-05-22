import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import StoryCard from '../components/StoryCard.jsx'

export default function Home() {
  const { apiKey, setApiKey, baseUrl } = useApp()
  const navigate = useNavigate()

  const [stories, setStories]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [settings, setSettings]   = useState(false)
  const [newKey, setNewKey]       = useState('')
  const [keyShow, setKeyShow]     = useState(false)

  const fetchStories = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${baseUrl}/api/stories`, {
        headers: { 'X-API-Key': apiKey },
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setStories(data)
    } catch (e) {
      setError(e.message || 'Failed to load stories')
    } finally {
      setLoading(false)
    }
  }, [apiKey, baseUrl])

  useEffect(() => { fetchStories() }, [fetchStories])

  const filtered = stories.filter(s =>
    s.title?.toLowerCase().includes(search.toLowerCase()) ||
    s.genre?.toLowerCase().includes(search.toLowerCase())
  )

  function handleSaveKey(e) {
    e.preventDefault()
    if (newKey.trim()) {
      setApiKey(newKey.trim())
      setSettings(false)
      setNewKey('')
    }
  }

  function handleDisconnect() {
    setApiKey('')
    navigate('/onboarding', { replace: true })
  }

  return (
    <div className="page">
      {/* Header */}
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '1.1rem', color: 'var(--primary-hover)' }}>✦</span>
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-lg)',
              fontWeight: 'var(--fw-semi)',
              color: 'var(--text)',
              whiteSpace: 'nowrap',
            }}
          >
            The Story Forge
          </span>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
      </header>

      {/* Body */}
      <div className="page-content--no-nav">
        {/* Search */}
        <div style={{ padding: 'var(--space-2) 0 var(--space-4)' }}>
          <div className="input-wrapper">
            <span
              style={{
                position: 'absolute',
                left: '0.875rem',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            >
              🔍
            </span>
            <input
              className="input"
              style={{ paddingLeft: '2.5rem' }}
              placeholder="Search stories…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* State: loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-16)' }}>
            <span className="spinner spinner-lg" />
          </div>
        )}

        {/* State: error */}
        {!loading && error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
            <span>⚠</span>
            <div>
              <strong>Could not load stories.</strong>
              <br />
              <span style={{ fontSize: 'var(--text-xs)' }}>{error}</span>
              <br />
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 'var(--space-2)' }}
                onClick={fetchStories}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* State: empty */}
        {!loading && !error && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">📖</div>
            <div className="empty-state__title">
              {search ? 'No stories found' : 'No stories yet'}
            </div>
            <div className="empty-state__text">
              {search
                ? `No stories matching "${search}"`
                : 'Your stories will appear here. Start writing your first one!'}
            </div>
            {!search && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 'var(--space-2)' }}
                onClick={() => navigate('/stories/new')}
              >
                ✦ Write your first story
              </button>
            )}
          </div>
        )}

        {/* Story grid */}
        {!loading && !error && filtered.length > 0 && (
          <>
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <span className="section-title">{filtered.length} {filtered.length === 1 ? 'Story' : 'Stories'}</span>
            </div>
            <div className="grid-2">
              {filtered.map(story => (
                <StoryCard
                  key={story.id}
                  story={story}
                  onClick={() => navigate(`/stories/${story.id}`)}
                />
              ))}
            </div>
          </>
        )}

        {/* Padding for FAB */}
        <div style={{ height: '5rem' }} />
      </div>

      {/* FAB */}
      <button
        className="fab fab--no-nav"
        onClick={() => navigate('/stories/new')}
        aria-label="New story"
        title="New story"
      >
        +
      </button>

      {/* Settings modal */}
      {settings && (
        <div className="modal-overlay" onClick={() => setSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">⚙ Settings</h2>

            <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
              <label className="form-label">Change API Key</label>
              <form onSubmit={handleSaveKey}>
                <div className="input-wrapper" style={{ marginBottom: 'var(--space-3)' }}>
                  <input
                    className="input"
                    type={keyShow ? 'text' : 'password'}
                    placeholder="New key…"
                    value={newKey}
                    onChange={e => setNewKey(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="button" className="input-icon" onClick={() => setKeyShow(s => !s)}>
                    {keyShow ? '🙈' : '👁'}
                  </button>
                </div>
                <button type="submit" className="btn btn-primary btn-full" disabled={!newKey.trim()}>
                  Save Key
                </button>
              </form>
            </div>

            <div className="divider" />

            <button
              className="btn btn-danger btn-full"
              onClick={handleDisconnect}
            >
              Disconnect &amp; Sign Out
            </button>

            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={() => setSettings(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
