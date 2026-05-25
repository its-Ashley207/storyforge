import { createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

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

// ── App Provider ─────────────────────────────────────────────
function AppProvider({ children }) {
  // Helper: make a fetch to the backend
  function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    }
    return fetch(`${BASE_URL}${path}`, { ...options, headers })
  }

  return (
    <AppContext.Provider value={{ baseUrl: BASE_URL, apiFetch }}>
      {children}
    </AppContext.Provider>
  )
}

// ── Router ────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/stories/new" element={<Setup />} />
      <Route path="/stories/:id" element={<StoryDetail />} />
      <Route path="/stories/:id/write" element={<Write />} />
      <Route path="/stories/:id/adventure" element={<Adventure />} />
      <Route path="/stories/:id/chat" element={<Chat />} />
      <Route path="/stories/:id/world" element={<WorldBuilder />} />
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
