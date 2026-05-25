import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'

const GENRES = [
  'Fantasy', 'Dark Fantasy', 'Sci-Fi', 'Cyberpunk', 'Mystery', 'Thriller',
  'Romance', 'Horror', 'Adventure', 'Historical', 'Literary', 'Isekai',
  'LitRPG', 'Dystopian', 'Space Opera', 'Steampunk', 'Paranormal', 'Western',
  'Slice of Life', 'Superhero',
]

const TONES = [
  'Epic & adventurous',
  'Dark & gritty',
  'Warm & cosy',
  'Mysterious & tense',
  'Humorous',
  'Romantic',
  'Philosophical',
  'Fast-paced action',
  'Slow burn',
  'Bittersweet',
  'Hopeful',
]

const ROLES = ['Hero', 'Villain', 'Mentor', 'Sidekick', 'Rival', 'Love interest', 'Anti-hero', 'Mysterious stranger', 'Comic relief', 'Other']

function StepIndicator({ step, total }) {
  return (
    <div className="steps">
      {Array.from({ length: total }, (_, i) => (
        <>
          <div
            key={`dot-${i}`}
            className={`step-dot ${i < step ? 'done' : i === step ? 'active' : ''}`}
          >
            {i < step ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div key={`line-${i}`} className={`step-line ${i < step ? 'done' : ''}`} />
          )}
        </>
      ))}
    </div>
  )
}

export default function Setup() {
  const { baseUrl } = useApp()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Step 1
  const [title, setTitle]         = useState('')
  const [premise, setPremise]     = useState('')
  const [genre, setGenre]         = useState('')
  const [genreCustom, setGenreCustom] = useState('')
  const [tone, setTone]           = useState('')
  const [chapters, setChapters]   = useState(10)

  // Step 2
  const [characters, setCharacters] = useState([{ name: '', role: '', description: '' }])

  // Step 3
  const [worldNotes, setWorldNotes] = useState('')

  function addCharacter() {
    if (characters.length < 10) {
      setCharacters(c => [...c, { name: '', role: '', description: '' }])
    }
  }

  function removeCharacter(i) {
    setCharacters(c => c.filter((_, idx) => idx !== i))
  }

  function updateCharacter(i, field, value) {
    setCharacters(c => c.map((ch, idx) => idx === i ? { ...ch, [field]: value } : ch))
  }

  function validateStep1() {
    if (!title.trim()) { setError('Please enter a story title.'); return false }
    if (!premise.trim()) { setError('Please enter a story premise.'); return false }
    if (!genre && !genreCustom.trim()) { setError('Please select or type a genre.'); return false }
    if (!tone) { setError('Please select a tone.'); return false }
    return true
  }

  function goNext() {
    setError('')
    if (step === 0 && !validateStep1()) return
    setStep(s => s + 1)
  }

  function goBack() {
    setError('')
    setStep(s => s - 1)
  }

  async function handleCreate() {
    setError('')
    setLoading(true)
    const finalGenre = genreCustom.trim() || genre
    const validChars = characters.filter(c => c.name.trim())
    const payload = {
      title: title.trim(),
      premise: premise.trim(),
      genre: finalGenre,
      tone,
      total_chapters: chapters,
      characters: validChars,
      world_notes: worldNotes.trim(),
    }
    try {
      const res = await fetch(`${baseUrl}/api/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || d.error || `Error ${res.status}`)
      }
      const story = await res.json()
      navigate(`/stories/${story.id}/write`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const finalGenre = genreCustom.trim() || genre

  return (
    <div className="page">
      {/* Header */}
      <header className="page-header">
        <button
          className="header-back"
          onClick={() => step === 0 ? navigate('/') : goBack()}
          aria-label="Back"
        >
          ←
        </button>
        <span className="header-title">
          {step === 0 ? 'The Story' : step === 1 ? 'Characters' : 'World & Start'}
        </span>
      </header>

      <StepIndicator step={step} total={3} />

      <div className="page-content--no-nav" style={{ paddingTop: 0, paddingBottom: 'var(--space-16)' }}>
        {/* ── STEP 1: Story ─────────────────────────────────── */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', animation: 'slideUp 0.3s ease' }}>
            <div className="form-group">
              <label className="form-label">Story Title *</label>
              <input
                className="input"
                placeholder="Enter a compelling title…"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Story Premise *</label>
              <textarea
                className="textarea"
                placeholder="What is your story about? Describe the core idea, conflict, and world…"
                value={premise}
                onChange={e => setPremise(e.target.value)}
                rows={5}
                style={{ minHeight: '120px' }}
              />
              <span className="form-hint">{premise.length}/2000 characters</span>
            </div>

            <div className="form-group">
              <label className="form-label">Genre *</label>
              <select
                className="select"
                value={genre}
                onChange={e => { setGenre(e.target.value); setGenreCustom('') }}
              >
                <option value="">Select a genre…</option>
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                <option value="__custom">Other / Custom…</option>
              </select>
              {(genre === '__custom' || genreCustom) && (
                <input
                  className="input"
                  style={{ marginTop: 'var(--space-2)' }}
                  placeholder="Type your genre…"
                  value={genreCustom}
                  onChange={e => setGenreCustom(e.target.value)}
                  autoFocus
                />
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Tone *</label>
              <select
                className="select"
                value={tone}
                onChange={e => setTone(e.target.value)}
              >
                <option value="">Select a tone…</option>
                {TONES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Total Chapters</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={chapters}
                  onChange={e => setChapters(Math.min(50, Math.max(1, Number(e.target.value))))}
                  style={{ width: '80px', flex: 'none' }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {[5, 10, 20, 30].map(n => (
                    <button
                      key={n}
                      type="button"
                      className={`btn btn-sm ${chapters === n ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setChapters(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <span className="form-hint">1–50 chapters</span>
            </div>
          </div>
        )}

        {/* ── STEP 2: Characters ────────────────────────────── */}
        {step === 1 && (
          <div style={{ animation: 'slideUp 0.3s ease' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
              Add up to 10 characters. At least one is recommended.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {characters.map((ch, i) => (
                <div
                  key={i}
                  className="card"
                  style={{ padding: 'var(--space-4)', animation: 'fadeIn 0.2s ease' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-semi)', color: 'var(--text-muted)' }}>
                      Character {i + 1}
                    </span>
                    {characters.length > 1 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeCharacter(i)}
                        style={{ color: 'var(--error)' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <input
                      className="input"
                      placeholder="Name"
                      value={ch.name}
                      onChange={e => updateCharacter(i, 'name', e.target.value)}
                    />
                    <select
                      className="select"
                      value={ch.role}
                      onChange={e => updateCharacter(i, 'role', e.target.value)}
                    >
                      <option value="">Role…</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <textarea
                      className="textarea"
                      placeholder="Brief description: appearance, personality, goals…"
                      value={ch.description}
                      onChange={e => updateCharacter(i, 'description', e.target.value)}
                      rows={2}
                      style={{ minHeight: '70px' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {characters.length < 10 && (
              <button
                className="btn btn-ghost btn-full"
                style={{ marginTop: 'var(--space-4)' }}
                onClick={addCharacter}
              >
                + Add Character
              </button>
            )}
          </div>
        )}

        {/* ── STEP 3: World & Review ────────────────────────── */}
        {step === 2 && (
          <div style={{ animation: 'slideUp 0.3s ease' }}>
            <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
              <label className="form-label">World Notes</label>
              <textarea
                className="textarea"
                placeholder="Magic systems, technology, geography, history, rules of your world… any details that will help the AI stay consistent."
                value={worldNotes}
                onChange={e => setWorldNotes(e.target.value)}
                rows={5}
                style={{ minHeight: '130px' }}
              />
              <span className="form-hint">Optional but recommended</span>
            </div>

            {/* Review */}
            <div className="section-title">Review</div>
            <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <div className="form-label" style={{ marginBottom: '2px' }}>Title</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>{title}</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span className="badge badge-primary">{finalGenre}</span>
                  <span className="badge badge-muted">{tone}</span>
                  <span className="badge badge-muted">{chapters} chapters</span>
                </div>
                <div>
                  <div className="form-label" style={{ marginBottom: '2px' }}>Premise</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-sub)', lineHeight: 1.6 }}>
                    {premise.slice(0, 120)}{premise.length > 120 ? '…' : ''}
                  </div>
                </div>
                {characters.filter(c => c.name.trim()).length > 0 && (
                  <div>
                    <div className="form-label" style={{ marginBottom: 'var(--space-2)' }}>Characters</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                      {characters.filter(c => c.name.trim()).map((c, i) => (
                        <div key={i} className="tag">
                          {c.name}{c.role ? ` · ${c.role}` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="alert alert-error" style={{ marginTop: 'var(--space-4)' }}>
            <span>⚠</span> {error}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          {step > 0 && (
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={goBack}>
              ← Back
            </button>
          )}
          {step < 2 ? (
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={goNext}>
              Continue →
            </button>
          ) : (
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? <><span className="spinner spinner-sm" /> Creating…</> : '✦ Begin Writing'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
