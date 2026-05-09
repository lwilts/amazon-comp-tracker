import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, TrendingUp, PoundSterling } from 'lucide-react'
import api from '../api'

function fmt(v, decimals = 0) {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: decimals }).format(v)
}

function fmtUSD(v) {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)
}

function currentTaxYear() {
  const now = new Date()
  const m = now.getMonth() + 1 // 1-based
  const d = now.getDate()
  const y = now.getFullYear()
  if (m > 4 || (m === 4 && d >= 6)) return `${y}/${String(y + 1).slice(2)}`
  return `${y - 1}/${String(y).slice(2)}`
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / 86400000)
}

function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
        {Icon && <Icon size={16} className={accent || 'text-gray-500'} />}
      </div>
      <div className={`text-2xl font-semibold font-mono ${accent || 'text-gray-100'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const ty = currentTaxYear()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: prices, isLoading: pricesLoading } = useQuery({
    queryKey: ['prices'],
    queryFn: () => api.get('/prices/current').then((r) => r.data),
    refetchInterval: 60_000,
    retry: false,
  })

  const refreshPrices = useMutation({
    mutationFn: () => api.post('/prices/refresh'),
    onSuccess: (res) => {
      qc.setQueryData(['prices'], res.data)
      qc.invalidateQueries({ queryKey: ['schedule'] })
    },
  })

  const { data: schedule, isLoading: schedLoading } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.get('/schedule').then((r) => r.data),
  })

  const tyBlock = schedule?.tax_years?.find((t) => t.tax_year === ty)

  const today = new Date().toISOString().split('T')[0]
  const allRsuLines = schedule?.tax_years?.flatMap((t) => t.lines.filter((l) => l.type === 'rsu')) || []
  const futureVests = allRsuLines.filter((l) => l.line_date >= today)
  const nextVest = futureVests.sort((a, b) => a.line_date.localeCompare(b.line_date))[0]

  const rsuValue = (line) => line.rsu_value_gbp || 0
  const totalUnvested = futureVests.reduce((s, l) => s + rsuValue(l), 0)

  const hasSalary = schedule?.tax_years?.some((t) => t.lines.some((l) => l.type === 'salary'))

  const ytdLines = tyBlock?.lines.filter((l) => l.line_date <= today) || []
  const ytdSalaryGross = ytdLines.filter((l) => l.type === 'salary').reduce((s, l) => s + (l.cash_gbp || 0), 0)
  const ytdPension = ytdLines.filter((l) => l.type === 'salary').reduce((s, l) => s + (l.pension_gbp || 0), 0)
  const ytdBonus = ytdLines.filter((l) => l.type === 'bonus').reduce((s, l) => s + (l.cash_gbp || 0), 0)
  const ytdRsu = ytdLines.filter((l) => l.type === 'rsu').reduce((s, l) => s + rsuValue(l), 0)

  if (pricesLoading || schedLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-600 border-t-brand" />
      </div>
    )
  }

  const fetchedAt = prices?.fetched_at
    ? new Date(prices.fetched_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : null

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-100">Dashboard</h1>

      {!schedLoading && !hasSalary && (
        <div className="card border border-brand/30 bg-brand/5 flex items-center justify-between">
          <span className="text-sm text-gray-300">Get started by adding your salary information.</span>
          <button onClick={() => navigate('/salary')} className="btn-primary text-sm">
            Add salary
          </button>
        </div>
      )}

      {/* Price cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="AMZN Price"
          value={prices ? fmtUSD(prices.amzn_usd) : 'No data'}
          sub={prices
            ? `${fmt(prices.amzn_gbp, 2)} · ${fetchedAt}`
            : (
              <button
                onClick={() => refreshPrices.mutate()}
                disabled={refreshPrices.isPending}
                className="flex items-center gap-1 text-brand hover:text-brand/80 disabled:opacity-50"
              >
                <RefreshCw size={11} className={refreshPrices.isPending ? 'animate-spin' : ''} />
                {refreshPrices.isPending ? 'Fetching…' : 'Refresh now'}
              </button>
            )}
          icon={TrendingUp}
          accent="text-brand"
        />
        <StatCard
          label="USD / GBP Rate"
          value={prices ? prices.usd_gbp.toFixed(4) : '—'}
          sub="Live rate"
          icon={RefreshCw}
        />
        <StatCard
          label={`Total Unvested RSU (Est)`}
          value={fmt(totalUnvested)}
          sub={`${futureVests.length} vest event(s) remaining`}
          icon={PoundSterling}
          accent="text-green-400"
        />
      </div>

      {/* Tax year + next vest */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="mb-3 text-sm font-semibold text-gray-300">
            Tax Year {ty} — Year to Date
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Salary (gross)</span>
              <span className="font-mono text-gray-100">{fmt(ytdSalaryGross)}</span>
            </div>
            {ytdPension > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Pension sacrifice</span>
                <span className="font-mono text-red-400">−{fmt(ytdPension)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Bonus received</span>
              <span className="font-mono text-gray-100">{fmt(ytdBonus)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">RSU vested</span>
              <span className="font-mono text-gray-100">{fmt(ytdRsu)}</span>
            </div>
            <div className="border-t border-surface-600 pt-2 space-y-1">
              {(() => {
                const tyPension = tyBlock?.subtotals.pension || 0
                const tyRsu = (tyBlock?.lines || []).filter(l => l.type === 'rsu').reduce((s, l) => s + rsuValue(l), 0)
                const grossTotal = (tyBlock?.subtotals.total_cash || 0) + tyRsu
                const taxableGross = grossTotal - tyPension
                return <>
                  <div className="flex justify-between font-semibold">
                    <span className="text-gray-300">Total gross</span>
                    <span className="font-mono text-gray-300">{fmt(grossTotal)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-gray-300">Taxable gross</span>
                    <span className="font-mono text-brand">{fmt(taxableGross)}</span>
                  </div>
                </>
              })()}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="mb-3 text-sm font-semibold text-gray-300">Next RSU Vest</div>
          {nextVest ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Date</span>
                <span className="font-mono text-gray-100">
                  {new Date(nextVest.line_date).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Shares</span>
                <span className="font-mono text-gray-100">{nextVest.rsu_shares}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Est. value</span>
                <span className={`font-mono ${nextVest.is_estimated ? 'italic text-yellow-400' : 'text-green-400'}`}>
                  {nextVest.is_estimated ? '~' : ''}{fmt(rsuValue(nextVest))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Days away</span>
                <span className="font-mono text-gray-100">{daysUntil(nextVest.line_date)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No upcoming vests</p>
          )}
        </div>
      </div>

      {/* Tax year summary table */}
      <div className="card">
        <div className="mb-3 text-sm font-semibold text-gray-300">All Tax Years</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-600 text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-2 text-left">Tax Year</th>
              <th className="pb-2 text-right">Salary (gross)</th>
              <th className="pb-2 text-right">Pension</th>
              <th className="pb-2 text-right">Bonus</th>
              <th className="pb-2 text-right">RSU</th>
              <th className="pb-2 text-right">Total Gross</th>
              <th className="pb-2 text-right">Taxable Gross</th>
            </tr>
          </thead>
          <tbody>
            {schedule?.tax_years?.map((t) => (
              <tr key={t.tax_year} className="border-b border-surface-700 table-row-hover">
                <td className="py-2 text-gray-300 font-mono">
                  {t.tax_year}
                  {t.tax_year === ty && (
                    <span className="ml-2 badge bg-brand/20 text-brand">current</span>
                  )}
                </td>
                <td className="py-2 text-right font-mono text-gray-300">{fmt(t.subtotals.base_salary)}</td>
                <td className="py-2 text-right font-mono text-red-400">
                  {t.subtotals.pension > 0 ? `−${fmt(t.subtotals.pension)}` : '—'}
                </td>
                <td className="py-2 text-right font-mono text-gray-300">{fmt(t.subtotals.bonus)}</td>
                <td className="py-2 text-right font-mono text-yellow-400">
                  {fmt(t.lines.filter(l => l.type === 'rsu').reduce((s, l) => s + rsuValue(l), 0))}
                </td>
                {(() => {
                  const tyRsu = t.lines.filter(l => l.type === 'rsu').reduce((s, l) => s + rsuValue(l), 0)
                  return <>
                    <td className="py-2 text-right font-mono text-gray-300">
                      {fmt(t.subtotals.total_cash + tyRsu)}
                    </td>
                    <td className="py-2 text-right font-mono font-semibold text-brand">
                      {fmt((t.subtotals.total_cash - t.subtotals.pension) + tyRsu)}
                    </td>
                  </>
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
