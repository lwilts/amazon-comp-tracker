import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import api from './api'
import Login from './components/Login'
import SetPassword from './components/SetPassword'
import Sidebar from './components/Sidebar'
import Bonuses from './pages/Bonuses'
import Dashboard from './pages/Dashboard'
import PaySchedule from './pages/PaySchedule'
import RSUAwards from './pages/RSUAwards'
import Salary from './pages/Salary'
import Settings from './pages/Settings'

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface-900">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-600 border-t-brand" />
    </div>
  )
}

function AuthGuard({ children }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api.get('/auth/status').then((r) => r.data),
    retry: false,
  })

  if (isLoading) return <Spinner />
  if (!data?.authenticated) return <Navigate to="/login" replace />
  return children
}

function Layout() {
  const qc = useQueryClient()

  useEffect(() => {
    api.get('/prices/current')
      .then((r) => {
        const ageMs = Date.now() - new Date(r.data.fetched_at).getTime()
        if (ageMs > 60 * 60 * 1000) {
          api.post('/prices/refresh')
            .then(() => qc.invalidateQueries({ queryKey: ['prices'] }))
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen overflow-hidden bg-surface-900 text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="salary" element={<Salary />} />
          <Route path="bonuses" element={<Bonuses />} />
          <Route path="rsu" element={<RSUAwards />} />
          <Route path="schedule" element={<PaySchedule />} />
          <Route path="settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<SetPassword />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        />
      </Routes>
    </HashRouter>
  )
}
