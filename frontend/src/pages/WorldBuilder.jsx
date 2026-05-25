import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import NavBar from '../components/NavBar.jsx'
import CharacterCard from '../components/CharacterCard.jsx'

const ROLES = ['Hero', 'Villain', 'Mentor', 'Sidekick', 'Rival', 'Love interest', 'Anti-hero', 'Mysterious stranger', 'Comic relief', 'Other']

export default function WorldBuilder() {
  const { id } = useParams()
  const { baseUrl } = useApp()
  const navigate = useNavigate()

  const [story, setStory]           = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [activeTab, setActiveTab]   = useState('characters')
  const [worldNotes, setWorldNotes] = useState('')
  const [saveStatus, setSaveStatus] = useState('') // '', 'saving', 'saved', 'error'
  const [characters, setCharacters] = useState([])
  const [showModal, setShowModal]   = useState(false)
  const [editTarget, setEditTarget] = useState(null) // null = new
  const [form, setForm]             = useState({ name: '', role: '', description: '' })
  const [formError, setFormError]   = useState('')
  const [saving, setSaving]         = useState(false)
  const saveTimer = useRef(null)

  const fetchStory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${baseUrl}/api/stories/${id}`, {
        headers: { },
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setStory(data)
      setCharacters(data.characters || [])
      setWorldNotes(data.world_notes || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, baseUrl])

  useEffect(() => { fetchStory() }, [fetchStory])

  // Debounced world notes save
  function handleWorldNotesChange(val) {
    setWorldNotes(val)
    setSaveStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`${baseUrl}/api/stories/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ world_notes: val }),
        })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus(''), 2000)
      } catch {
        setSaveStatus('error')
      }
    }, 1200)
  }

  function openNew() {
    setEditTarget(null)
    setForm({ name: '', role: '', description: '' })
    setFormError('')
    setShowModal(true)
  }

  function openEdit(char) {
    setEditTarget(char)
    setForm({ name: char.name || '', role: char.role || '', description: char.description || '' })
    setFormError('')
    setShowModal(true)
  }

  async function saveCharacter() {
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    setSaving(true)
    setFormError('')
    try {
      let res
      if (editTarget?.id) {
        res = await fetch(`${baseUrl}/api/stories/${id}/characters/${editTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        res = await fetch(`${baseUrl}/api/stories/${id}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || d.error || `Error ${res.status}`)
      }
      setShowModal(false)
      await fetchStory()
    } catch (e) {
      setFormError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteCharacter(char) {
    if (!window.confirm(`Delete ${char.name}?`)) return
    try {
      if (char.id) {
        await fetch(`${baseUrl}/api/stories/${id}/characters/${char.id}`, {
          method: 'DELETE',
          headers: { },
        })
      }
      await fetchStory()
    } catch (e) {
      setError(e.message)
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
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '1px' }}>World Builder</div>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'characters' ? 'active' : ''}`}
            onClick={() => setActiveTab('characters')}
          >
            👤 Characters
          </button>
          <button
            className={`tab-btn ${activeTab === 'world' ? 'active' : ''}`}
            onClick={() => setActiveTab('world')}
          >
            🌍 World Notes
          </button>
        </div>
      </div>

      <div className="page-content">
        {/* Characters tab */}
        {activeTab === 'characters' && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            {characters.length === 0 ? (
              <div className="empty-state" style={{ paddingTop: 'var(--space-12)' }}>
                <div className="empty-state__icon">👤</div>
                <div className="empty-state__title">No characters yet</div>
                <div className="empty-state__text">Add the heroes, villains, and supporting cast of your story</div>
                <button className="btn btn-primary" style={{ marginTop: 'var(--space-2)' }} onClick={openNew}>
                  + Add Character
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {characters.map((ch, i) => (
                  <CharacterCard
                    key={ch.id || i}
                    character={ch}
                    onEdit={() => openEdit(ch)}
                    onDelete={() => deleteCharacter(ch)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* World Notes tab */}
        {activeTab === 'world' && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <span className="section-title">World Notes</span>
              {saveStatus === 'saving' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <span className="spinner spinner-sm" /> Saving…
                </span>
              )}
              {saveStatus === 'saved' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>✓ Saved</span>
              )}
              {saveStatus === 'error' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--error)' }}>⚠ Save failed</span>
              )}
            </div>
            <textarea
              className="textarea"
              placeholder="Magic systems, world history, technology levels, geography, faction politics, special rules… any details that ground your story world."
              value={worldNotes}
              onChange={e => handleWorldNotesChange(e.target.value)}
              style={{ minHeight: '350px', lineHeight: 1.8 }}
            />
            <p className="form-hint">Auto-saves as you type</p>
          </div>
        )}
      </div>

      {/* FAB for characters */}
      {activeTab === 'characters' && characters.length > 0 && (
        <button className="fab" onClick={openNew} aria-label="Add character">+</button>
      )}

      {/* Character modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editTarget ? 'Edit Character' : 'New Character'}</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  className="input"
                  placeholder="Character name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="select"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="">Select role…</option>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="textarea"
                  placeholder="Appearance, personality, backstory, goals, relationships…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={4}
                />
              </div>
            </div>

            {formError && (
              <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>
                <span>⚠</span> {formError}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={saveCharacter}
                disabled={saving}
              >
                {saving ? <><span className="spinner spinner-sm" /> Saving…</> : (editTarget ? 'Save Changes' : 'Add Character')}
              </button>
            </div>
          </div>
        </div>
      )}

      <NavBar storyId={id} active="world" />
    </div>
  )
}
