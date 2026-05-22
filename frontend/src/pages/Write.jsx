import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import StreamingText from '../components/StreamingText.jsx'
import NavBar from '../components/NavBar.jsx'

const WORD_COUNTS = [300, 500, 600, 800, 1000, 1500, 2000]

export default function Write() {
  const { id } = useParams()
  const { apiKey, baseUrl } = useApp()
  const navigate = useNavigate()

  const [story, setStory]           = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [hint, setHint]             = useState('')
  const [wordCount, setWordCount]   = useState(800)
  const [streaming, setStreaming]   = useState(false)
  const [streamText, setStreamText] = useState('')
  const [accepted, setAccepted]     = useState(false)
  const [genError, setGenError]     = useState('')
  const [expandedCh, setExpandedCh] = useState(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const abortRef = useRef(null)

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

  const currentChapter = story ? (story.chapters?.length ?? 0) + 1 : 1
  const isComplete = story && currentChapter > story.total_chapters

  async function generateChapter() {
    setGenError('')
    setStreamText('')
    setAccepted(false)
    setStreaming(true)
    setShowCelebration(false)

    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch(`${baseUrl}/api/generate/chapter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          story_id: id,
          chapter_number: currentChapter,
          hint: hint.trim() || null,
          word_count: wordCount,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || d.error || `Error ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') continue
            try {
              const obj = JSON.parse(raw)
              const token = obj.token ?? obj.text ?? obj.content ?? ''
              if (token) setStreamText(t => t + token)
            } catch {
              // bare text token
              setStreamText(t => t + raw)
            }
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setGenError(e.message || 'Generation failed')
      }
    } finally {
      setStreaming(false)
    }
  }

  async function acceptChapter() {
    if (!streamText.trim()) return
    try {
      await fetch(`${baseUrl}/api/stories/${id}/chapters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ content: streamText, chapter_number: currentChapter }),
      })
      setAccepted(true)
      setHint('')
      await fetchStory()
      if (story && currentChapter >= story.total_chapters) {
        setShowCelebration(true)
      }
    } catch (e) {
      setGenError(e.message)
    }
  }

  function redo() {
    setStreamText('')
    setAccepted(false)
    setGenError('')
  }

  const words = streamText.trim() ? streamText.trim().split(/\s+/).length : 0

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
        <button className="btn btn-ghost" style={{ marginTop: 'var(--space-4)' }} onClick={() => navigate(-1)}>← Back</button>
      </div>
    )
  }

  const progress = story ? Math.round(((story.chapters?.length ?? 0) / story.total_chapters) * 100) : 0

  return (
    <div className="page">
      {/* Header */}
      <header className="page-header">
        <button className="header-back" onClick={() => navigate(`/stories/${id}`)} aria-label="Back">←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="header-title">{story?.title}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '1px' }}>
            Chapter {Math.min(currentChapter, story?.total_chapters ?? 1)} of {story?.total_chapters}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ padding: '0 var(--space-4)' }}>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-label">
          <span>{story?.chapters?.length ?? 0} chapters written</span>
          <span>{progress}%</span>
        </div>
      </div>

      <div className="page-content" style={{ paddingBottom: 'calc(var(--nav-height) + var(--space-6))' }}>

        {/* Celebration */}
        {showCelebration && (
          <div
            className="card card--glow"
            style={{ textAlign: 'center', padding: 'var(--space-8)', marginBottom: 'var(--space-5)', animation: 'slideUp 0.4s ease' }}
          >
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-3)' }}>🎉</div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)', color: 'var(--text)', marginBottom: 'var(--space-2)' }}>
              Story Complete!
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)' }}>
              You've written all {story?.total_chapters} chapters!
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => navigate(`/stories/${id}`)}>
                View Story →
              </button>
            </div>
          </div>
        )}

        {/* Generate section — only show if not complete */}
        {!isComplete && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
            <div className="section-title">Chapter {currentChapter} — New Chapter</div>

            <div className="form-group">
              <label className="form-label">Chapter Hint (optional)</label>
              <textarea
                className="textarea"
                placeholder="What should happen in this chapter? The AI will follow your direction while maintaining story consistency…"
                value={hint}
                onChange={e => setHint(e.target.value)}
                rows={3}
                disabled={streaming || accepted}
              />
            </div>

            {/* Word count selector */}
            <div className="form-group">
              <label className="form-label">Word Count</label>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {WORD_COUNTS.map(n => (
                  <button
                    key={n}
                    className={`btn btn-sm ${wordCount === n ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setWordCount(n)}
                    disabled={streaming}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            {!streamText && (
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={generateChapter}
                disabled={streaming}
              >
                {streaming
                  ? <><span className="spinner spinner-sm" /> Generating…</>
                  : '✦ Generate Chapter'
                }
              </button>
            )}
          </div>
        )}

        {/* Streaming area */}
        {(streaming || streamText) && (
          <div style={{ marginBottom: 'var(--space-5)', animation: 'slideUp 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <span className="section-title">Generated Text</span>
              {words > 0 && (
                <span className="wordcount">
                  {words} words
                </span>
              )}
            </div>
            <div
              className="reading-panel"
              style={{ maxHeight: '50vh' }}
            >
              <StreamingText text={streamText} isStreaming={streaming} />
            </div>

            {!streaming && streamText && !accepted && (
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <button className="btn btn-success" style={{ flex: 1 }} onClick={acceptChapter}>
                  ✓ Accept Chapter
                </button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={redo}>
                  ↺ Redo
                </button>
              </div>
            )}

            {accepted && (
              <div className="alert alert-success" style={{ marginTop: 'var(--space-3)' }}>
                ✓ Chapter accepted! {!isComplete && 'Ready for the next chapter.'}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {genError && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
            <span>⚠</span> {genError}
          </div>
        )}

        {/* Previous chapters */}
        {story?.chapters?.length > 0 && (
          <div>
            <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>Previous Chapters</div>
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
                    <div className="chapter-item__content">
                      {ch.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <NavBar storyId={id} active="write" />
    </div>
  )
}
