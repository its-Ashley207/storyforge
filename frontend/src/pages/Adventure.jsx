import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import StreamingText from '../components/StreamingText.jsx'
import NavBar from '../components/NavBar.jsx'

export default function Adventure() {
  const { id } = useParams()
  const { apiKey, baseUrl } = useApp()
  const navigate = useNavigate()

  const [story, setStory]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  const [nodeText, setNodeText]   = useState('')
  const [choices, setChoices]     = useState([])
  const [breadcrumb, setBreadcrumb] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [genError, setGenError]   = useState('')
  const [sessionId] = useState(() => Math.random().toString(36).slice(2))
  const abortRef = useRef(null)

  const fetchStory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${baseUrl}/api/stories/${id}`, {
        headers: { 'X-API-Key': apiKey },
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setStory(data)
      // Auto-start first node
      await generateNode(data, null, null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, apiKey, baseUrl])

  useEffect(() => { fetchStory() }, [fetchStory])

  async function generateNode(storyData, choice, choiceLabel) {
    setGenError('')
    setStreamText('')
    setChoices([])
    setStreaming(true)

    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    if (choiceLabel) {
      setBreadcrumb(b => [...b, choiceLabel])
    }

    const s = storyData || story
    try {
      const res = await fetch(`${baseUrl}/api/generate/adventure-node`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          story_id: id,
          session_id: sessionId,
          choice_made: choice,
          breadcrumb,
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
      let accumulated = ''

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
              if (obj.choices) {
                setChoices(obj.choices)
                continue
              }
              const token = obj.token ?? obj.text ?? obj.content ?? ''
              if (token) {
                accumulated += token
                setStreamText(accumulated)
              }
            } catch {
              accumulated += raw
              setStreamText(accumulated)
            }
          }
        }
      }
      setNodeText(accumulated)
    } catch (e) {
      if (e.name !== 'AbortError') {
        setGenError(e.message || 'Generation failed')
      }
    } finally {
      setStreaming(false)
    }
  }

  function handleChoice(choice, label) {
    generateNode(null, choice, label)
  }

  function restart() {
    setBreadcrumb([])
    setNodeText('')
    setStreamText('')
    setChoices([])
    generateNode(story, null, null)
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
        <button className="btn btn-ghost" style={{ marginTop: 'var(--space-4)' }} onClick={() => navigate(-1)}>← Back</button>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <header className="page-header">
        <button className="header-back" onClick={() => navigate(`/stories/${id}`)} aria-label="Back">←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="header-title">{story?.title}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '1px' }}>Adventure Mode</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={restart}
          disabled={streaming}
          title="Restart"
        >
          ↺
        </button>
      </header>

      <div className="page-content">
        {/* Breadcrumb */}
        {breadcrumb.length > 0 && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div className="breadcrumb">
              <span className="breadcrumb-item">Start</span>
              {breadcrumb.map((b, i) => (
                <>
                  <span key={`sep-${i}`} className="breadcrumb-sep">›</span>
                  <span key={`item-${i}`} className="breadcrumb-item">{b}</span>
                </>
              ))}
            </div>
          </div>
        )}

        {/* Story text */}
        <div className="reading-panel" style={{ marginBottom: 'var(--space-5)' }}>
          <StreamingText text={streamText || nodeText} isStreaming={streaming} />
        </div>

        {/* Error */}
        {genError && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
            <span>⚠</span> {genError}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => generateNode(null, null, null)}>
              Retry
            </button>
          </div>
        )}

        {/* Choices */}
        {!streaming && choices.length > 0 && (
          <div style={{ animation: 'slideUp 0.3s ease' }}>
            <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>What do you do?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {choices.map((c, i) => (
                <button
                  key={i}
                  className="choice-btn"
                  onClick={() => handleChoice(c.value || c, c.label || c)}
                >
                  <span className="choice-label">{String.fromCharCode(65 + i)}</span>
                  <span>{c.label || c}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Default choices if none returned */}
        {!streaming && choices.length === 0 && nodeText && (
          <div style={{ animation: 'slideUp 0.3s ease' }}>
            <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>What happens next?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {['Press forward', 'Investigate carefully', 'Take a different path'].map((c, i) => (
                <button
                  key={i}
                  className="choice-btn"
                  onClick={() => handleChoice(c, c)}
                >
                  <span className="choice-label">{String.fromCharCode(65 + i)}</span>
                  <span>{c}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: '2rem' }} />
      </div>

      <NavBar storyId={id} active="adventure" />
    </div>
  )
}
