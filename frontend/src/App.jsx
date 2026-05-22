import { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'

import Onboarding   from './pages/Onboarding.jsx'
import Home         from './pages/Home.jsx'
import Setup        from './pages/Setup.jsx'
import StoryDetail  from './pages/StoryDetail.jsx'
import Write        from './pages/Write.jsx'
import Adventure    from './pages/Adventure.jsx'
import Chat         from './pages/Chat.jsx'
import WorldBuilder from './pages/WorldBuilder.jsx'

// ── App Context ──────────────────────────────────────────────
export const AppContext = createContext(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

// Base URL: empty string in production (same origin), or env var in dev
const BASE_URL = import.meta.env.VITE_API_URL || ''

// ── Auth Guard ───────────────────────────────────────────────
function RequireKey({ children }) {
  const { apiKey } = useApp()
  if (!apiKey) return <Navigate to="/onboarding" replace />
  return children
}

// ── App Provider ─────────────────────────────────────────────
function AppProvider({ children }) {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem('sf_api_key') || '')

  function setApiKey(key) {
    if (key) {
      localStorage.setItem('sf_api_key', key)
    } else {
      localStorage.removeItem('sf_api_key')
    }
    setApiKeyState(key)
  }

  // Helper: make an authenticated fetch
  function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      ...(options.headers || {}),
    }
    return fetch(`${BASE_URL}${path}`, { ...options, headers })
  }

  return (
    <AppContext.Provider value={{ apiKey, setApiKey, baseUrl: BASE_URL, apiFetch }}>
      {children}
    </AppContext.Provider>
  )
}

// ── Router ────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/" element={
        <RequireKey><Home /></RequireKey>
      } />
      <Route path="/stories/new" element={
        <RequireKey><Setup /></RequireKey>
      } />
      <Route path="/stories/:id" element={
        <RequireKey><StoryDetail /></RequireKey>
      } />
      <Route path="/stories/:id/write" element={
        <RequireKey><Write /></RequireKey>
      } />
      <Route path="/stories/:id/adventure" element={
        <RequireKey><Adventure /></RequireKey>
      } />
      <Route path="/stories/:id/chat" element={
        <RequireKey><Chat /></RequireKey>
      } />
      <Route path="/stories/:id/world" element={
        <RequireKey><WorldBuilder /></RequireKey>
      } />
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ── Root App ─────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  )
}
