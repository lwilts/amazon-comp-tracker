import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Banknote,
  Gift,
  TrendingUp,
  CalendarDays,
  Settings,
  LogOut,
} from 'lucide-react'
import api from '../api'

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/salary', label: 'Salary', icon: Banknote },
  { path: '/bonuses', label: 'Bonuses', icon: Gift },
  { path: '/rsu', label: 'RSU Awards', icon: TrendingUp },
  { path: '/schedule', label: 'Pay Schedule', icon: CalendarDays },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()

  async function handleLogout() {
    await api.post('/auth/logout')
    qc.clear()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="flex w-52 flex-shrink-0 flex-col border-r border-surface-600 bg-surface-800">
      <div className="border-b border-surface-600 px-4 py-4">
        <div className="text-lg font-semibold text-brand">Amazon Comp Tracker</div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV.map(({ path, label, icon: Icon }) => {
          const active = location.pathname.startsWith(path)
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-100 ${
                active
                  ? 'border-l-2 border-brand bg-surface-700 pl-2.5 text-brand'
                  : 'text-gray-400 hover:bg-surface-700 hover:text-gray-200'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-surface-600 px-2 py-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-surface-700 hover:text-red-400"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
