import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'

export default function Onboarding() {
  const { setApiKey, baseUrl } = useApp()
  const navigate = useNavigate()

  const [key, setKey]         = useState('')
  const [show, setShow]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [faqOpen, setFaqOpen] = useState(false)

  async function handleConnect(e) {
    e.preventDefault()
    if (!key.trim()) { setError('Please enter your API key.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${baseUrl}/api/validate-key`, {
        method: 'POST',
        headers: { 'X-API-Key': key.trim() },
      })
      if (res.ok) {
        setApiKey(key.trim())
        navigate('/', { replace: true })
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.detail || data.error || 'Invalid API key. Please check and try again.')
      }
    } catch {
      setError('Could not connect to the server. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Animated background */}
      <div className="onboarding-bg" />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-6)',
          maxWidth: 'var(--page-max)',
          margin: '0 auto',
          width: '100%',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-10)', animation: 'float 3s ease-in-out infinite' }}>
          <div style={{ fontSize: '3.5rem', lineHeight: 1, marginBottom: 'var(--space-4)' }}>✦</div>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-3xl)',
              fontWeight: 'var(--fw-semi)',
              color: 'var(--text)',
              letterSpacing: '-0.02em',
              marginBottom: 'var(--space-2)',
            }}
          >
            The Story Forge
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Your personal AI story writer
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            width: '100%',
            background: 'rgba(15, 17, 23, 0.85)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-8) var(--space-6)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,106,247,0.1)',
            animation: 'slideUp 0.5s ease',
          }}
        >
          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
            {/* Step 1 */}
            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  background: 'var(--primary-glow)',
                  border: '1px solid rgba(124,106,247,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--fw-bold)',
                  color: 'var(--primary-hover)',
                  flexShrink: 0,
                  marginTop: '0.1rem',
                }}
              >
                1
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--text)', marginBottom: 'var(--space-2)' }}>
                  Get your DeepSeek API key
                </p>
                <a
                  href="https://platform.deepseek.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-1)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--primary-hover)',
                    background: 'var(--primary-glow2)',
                    border: '1px solid rgba(124,106,247,0.25)',
                    borderRadius: 'var(--radius-full)',
                    padding: '0.25rem 0.75rem',
                    textDecoration: 'none',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--primary-glow)'
                    e.currentTarget.style.borderColor = 'rgba(124,106,247,0.5)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--primary-glow2)'
                    e.currentTarget.style.borderColor = 'rgba(124,106,247,0.25)'
                  }}
                >
                  platform.deepseek.com ↗
                </a>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  background: 'var(--primary-glow)',
                  border: '1px solid rgba(124,106,247,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--fw-bold)',
                  color: 'var(--primary-hover)',
                  flexShrink: 0,
                  marginTop: '0.1rem',
                }}
              >
                2
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--text)', marginBottom: 'var(--space-3)' }}>
                  Enter your key below
                </p>
                <form onSubmit={handleConnect}>
                  <div className="input-wrapper" style={{ marginBottom: 'var(--space-3)' }}>
                    <input
                      className="input"
                      type={show ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={key}
                      onChange={e => setKey(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="input-icon"
                      onClick={() => setShow(s => !s)}
                      aria-label={show ? 'Hide key' : 'Show key'}
                    >
                      {show ? '🙈' : '👁'}
                    </button>
                  </div>

                  {error && (
                    <div className="alert alert-error" style={{ marginBottom: 'var(--space-3)' }}>
                      <span>⚠</span> {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary btn-full btn-lg"
                    disabled={loading}
                  >
                    {loading ? (
                      <><span className="spinner spinner-sm" /> Connecting…</>
                    ) : (
                      '✦ Connect'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div>
            <button
              type="button"
              className="collapsible-trigger"
              style={{ borderRadius: 'var(--radius)', fontSize: 'var(--text-xs)' }}
              onClick={() => setFaqOpen(o => !o)}
            >
              <span>What is DeepSeek?</span>
              <span style={{ transition: 'transform 0.2s', transform: faqOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
            </button>
            {faqOpen && (
              <div
                className="collapsible-content"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--text-sub)', lineHeight: 1.7 }}
              >
                DeepSeek is a powerful AI language model that excels at creative writing.
                It offers a generous free tier — enough to write entire novels.
                Your API key is stored <strong style={{ color: 'var(--text)' }}>only on your device</strong> and sent
                directly to DeepSeek servers. The Story Forge never sees or stores it.
              </div>
            )}
          </div>
        </div>

        <p style={{ marginTop: 'var(--space-6)', fontSize: 'var(--text-xs)', color: 'var(--text-dim)', textAlign: 'center' }}>
          Your key is stored locally and never shared
        </p>
      </div>
    </div>
  )
}
