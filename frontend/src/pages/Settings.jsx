import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Check } from 'lucide-react'
import api from '../api'
import { useSettings, useUpdateSettings } from '../hooks/useSettings'

export default function Settings() {
  const qc = useQueryClient()
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [pwMsg, setPwMsg] = useState(null) // { type: 'success'|'error', text }
  const { currency } = useSettings()
  const updateSettings = useUpdateSettings()

  const { data: prices, refetch: refetchPrices } = useQuery({
    queryKey: ['prices'],
    queryFn: () => api.get('/prices/current').then((r) => r.data),
    retry: false,
  })

  const refreshMutation = useMutation({
    mutationFn: () => api.post('/prices/refresh'),
    onSuccess: (res) => {
      qc.setQueryData(['prices'], res.data)
      qc.invalidateQueries({ queryKey: ['schedule'] })
    },
  })

  const changePwMutation = useMutation({
    mutationFn: (data) => api.post('/auth/change-password', data),
    onSuccess: () => {
      setPwMsg({ type: 'success', text: 'Password changed successfully' })
      setPwForm({ current_password: '', new_password: '', confirm_password: '' })
    },
    onError: (err) => {
      setPwMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to change password' })
    },
  })

  function handleChangePw(e) {
    e.preventDefault()
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwMsg({ type: 'error', text: 'New passwords do not match' })
      return
    }
    setPwMsg(null)
    changePwMutation.mutate(pwForm)
  }

  const fetchedAt = prices?.fetched_at
    ? new Date(prices.fetched_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
    : null

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-semibold text-gray-100">Settings</h1>

      {/* Change password */}
      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-gray-300">Change Password</h2>
        <form onSubmit={handleChangePw} className="space-y-3">
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input" value={pwForm.current_password}
              onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} required />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" value={pwForm.new_password}
              onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} required minLength={8} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input" value={pwForm.confirm_password}
              onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })} required />
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {pwMsg.text}
            </p>
          )}
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={changePwMutation.isPending}>
            <Check size={14} /> {changePwMutation.isPending ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>

      {/* Display preferences */}
      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-gray-300">Display Preferences</h2>
        <div>
          <label className="label">Currency</label>
          <div className="flex gap-3 mt-1">
            {['GBP', 'USD'].map((c) => (
              <label key={c} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                <input
                  type="radio"
                  name="currency"
                  value={c}
                  checked={currency === c}
                  onChange={() => updateSettings.mutate({ display_currency: c })}
                  className="accent-brand"
                />
                {c === 'GBP' ? '£ GBP' : '$ USD'}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Affects how RSU values and the dashboard are displayed. Salary and bonus amounts are shown as entered.
          </p>
        </div>
      </div>

      {/* Price data */}
      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-gray-300">Market Data</h2>
        <div className="space-y-2 text-sm mb-4">
          {prices ? (
            <>
              <div className="flex justify-between">
                <span className="text-gray-400">Last fetched</span>
                <span className="font-mono text-gray-300">{fetchedAt}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">AMZN</span>
                <span className="font-mono text-brand">${prices.amzn_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">USD/GBP</span>
                <span className="font-mono text-gray-300">{prices.usd_gbp.toFixed(4)}</span>
              </div>
            </>
          ) : (
            <p className="text-gray-500">No price data yet</p>
          )}
        </div>
        <button
          className="btn-secondary flex items-center gap-2 text-sm"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          <RefreshCw size={14} className={refreshMutation.isPending ? 'animate-spin' : ''} />
          {refreshMutation.isPending ? 'Fetching…' : 'Refresh now'}
        </button>
        {refreshMutation.isError && (
          <p className="mt-2 text-sm text-red-400">
            {refreshMutation.error?.response?.data?.detail || 'Refresh failed'}
          </p>
        )}
      </div>
    </div>
  )
}
