import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import NavBar from '../components/NavBar.jsx'

export default function Chat() {
  const { id } = useParams()
  const { baseUrl } = useApp()
  const navigate = useNavigate()

  const [story, setStory]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef    = useRef(null)
  const abortRef       = useRef(null)

  const scrollBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

  useEffect(() => { scrollBottom() }, [messages, streaming])

  const fetchStory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${baseUrl}/api/stories/${id}`, {
        headers: { },
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setStory(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, baseUrl])

  useEffect(() => { fetchStory() }, [fetchStory])

  async function sendMessage() {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    const userMsg = { role: 'user', content: text }
    setMessages(m => [...m, userMsg])
    setStreaming(true)

    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    // Optimistic AI bubble
    setMessages(m => [...m, { role: 'assistant', content: '' }])

    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          story_id: id,
          message: text,
          history: messages.slice(-10),
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
              const token = obj.token ?? obj.text ?? obj.content ?? ''
              if (token) {
                accumulated += token
                setMessages(m => {
                  const updated = [...m]
                  updated[updated.length - 1] = { role: 'assistant', content: accumulated }
                  return updated
                })
              }
            } catch {
              accumulated += raw
              setMessages(m => {
                const updated = [...m]
                updated[updated.length - 1] = { role: 'assistant', content: accumulated }
                return updated
              })
            }
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setMessages(m => {
          const updated = [...m]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `⚠ ${e.message || 'Error occurred'}`,
            isError: true,
          }
          return updated
        })
      }
    } finally {
      setStreaming(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function autoResize() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
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
    <div className="page" style={{ height: '100dvh', overflow: 'hidden' }}>
      {/* Header */}
      <header className="page-header">
        <button className="header-back" onClick={() => navigate(`/stories/${id}`)} aria-label="Back">←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="header-title">{story?.title}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '1px' }}>Story Chat</div>
        </div>
      </header>

      {/* Messages */}
      <div className="chat-messages" style={{ paddingBottom: '0' }}>
        {/* System message */}
        <div className="chat-bubble chat-bubble--system">
          💬 Chat with AI to develop your story, characters, and plot
        </div>
        <div
          className="chat-bubble chat-bubble--system"
          style={{ background: 'var(--primary-glow2)', borderColor: 'rgba(124,106,247,0.2)', color: 'var(--primary-hover)' }}
        >
          Context: "{story?.title}" · {story?.genre} · {story?.chapters?.length ?? 0} chapters written
        </div>

        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 'var(--text-sm)' }}>
              Try asking…
            </p>
            {[
              'What should happen in the next chapter?',
              'Develop my main character\'s backstory',
              'Suggest a plot twist',
              'Help me name a new character',
            ].map((s, i) => (
              <button
                key={i}
                className="btn btn-ghost btn-sm"
                style={{ textAlign: 'left', justifyContent: 'flex-start', padding: 'var(--space-3)' }}
                onClick={() => { setInput(s); textareaRef.current?.focus() }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--ai'}`}
            style={msg.isError ? { color: 'var(--error)', background: 'var(--error-dim)' } : {}}
          >
            {msg.content || (streaming && i === messages.length - 1 ? <span className="stream-cursor" /> : '')}
            {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
              <span className="stream-cursor" />
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area" style={{ paddingBottom: 'calc(var(--nav-height) + var(--space-2))' }}>
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder="Ask about your story…"
          value={input}
          onChange={e => { setInput(e.target.value); autoResize() }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={streaming}
        />
        <button
          className="btn btn-primary btn-icon"
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          aria-label="Send"
        >
          {streaming ? <span className="spinner spinner-sm" /> : '↑'}
        </button>
      </div>

      <NavBar storyId={id} active="chat" />
    </div>
  )
}
