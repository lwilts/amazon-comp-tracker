import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import api from '../api'

function formatGBP(v) {
  if (v == null) return ''
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(v)
}

function TypeBadge({ type }) {
  const map = {
    salary: 'bg-blue-900/40 text-blue-400',
    bonus: 'bg-purple-900/40 text-purple-400',
    rsu: 'bg-brand/20 text-brand',
  }
  return <span className={`badge ${map[type] || 'bg-surface-600 text-gray-400'}`}>{type}</span>
}

function exportCsv(schedule) {
  const rows = [['Tax Year', 'Date', 'Pay Date', 'Type', 'Description', 'Cash GBP', 'RSU Shares', 'RSU Value GBP', 'Status', 'Total GBP']]
  for (const ty of schedule.tax_years) {
    for (const l of ty.lines) {
      const total = l.cash_gbp ?? l.rsu_value_gbp ?? ''
      rows.push([ty.tax_year, l.line_date, l.pay_date, l.type, `"${l.description}"`,
        l.cash_gbp ?? '', l.rsu_shares ?? '', l.rsu_value_gbp ?? '', l.status, total])
    }
    rows.push([ty.tax_year, '', '', '', 'SUBTOTAL', ty.subtotals.base_salary + ty.subtotals.bonus,
      '', ty.subtotals.rsu, '', ty.subtotals.total_inc_rsu])
  }
  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `compensation-schedule.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function PaySchedule() {
  const [filterYear, setFilterYear] = useState('all')
  const [filterType, setFilterType] = useState('all')

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.get('/schedule').then((r) => r.data),
  })

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-600 border-t-brand" />
    </div>
  )

  const years = schedule?.tax_years?.map((t) => t.tax_year) || []
  const visibleYears = filterYear === 'all' ? years : years.filter((y) => y === filterYear)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Pay Schedule</h1>
        <button className="btn-secondary flex items-center gap-2 text-sm" onClick={() => exportCsv(schedule)}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div>
          <label className="label">Tax Year</label>
          <select className="input w-36 text-sm" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="all">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <div className="flex gap-1 mt-1">
            {['all', 'salary', 'bonus', 'rsu'].map((t) => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  filterType === t
                    ? 'bg-brand text-white'
                    : 'bg-surface-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {schedule?.tax_years
        ?.filter((t) => visibleYears.includes(t.tax_year))
        .map((tyBlock) => {
          const lines = tyBlock.lines.filter((l) => filterType === 'all' || l.type === filterType)
          return (
            <div key={tyBlock.tax_year} className="card p-0 overflow-hidden">
              {/* Tax year header */}
              <div className="border-b border-surface-600 bg-surface-700 px-4 py-2 flex items-center justify-between">
                <span className="font-semibold text-gray-200">Tax Year {tyBlock.tax_year}</span>
                <div className="flex gap-4 text-xs font-mono text-gray-400">
                  <span>Salary: {formatGBP(tyBlock.subtotals.base_salary)}</span>
                  <span>Bonus: {formatGBP(tyBlock.subtotals.bonus)}</span>
                  <span>RSU: {formatGBP(tyBlock.subtotals.rsu)}</span>
                  <span className="text-gray-300">Total gross: {formatGBP(tyBlock.subtotals.total_inc_rsu)}</span>
                  <span className="font-semibold text-brand">Taxable gross: {formatGBP(tyBlock.subtotals.total_inc_rsu - tyBlock.subtotals.pension)}</span>
                </div>
              </div>

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-600 text-gray-500 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Pension (£)</th>
                    <th className="px-3 py-2 text-right">RSU Shares</th>
                    <th className="px-3 py-2 text-right">Total Gross (£)</th>
                    <th className="px-3 py-2 text-right">Taxable Gross (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const totalGross = line.cash_gbp ?? line.rsu_value_gbp ?? 0
                    const taxableGross = totalGross - (line.pension_gbp || 0)
                    return (
                      <tr key={i} className={`border-b border-surface-700 table-row-hover ${line.type === 'rsu' ? 'bg-brand/5' : ''}`}>
                        <td className="px-3 py-2 font-mono text-gray-400">{line.line_date}</td>
                        <td className="px-3 py-2"><TypeBadge type={line.type} /></td>
                        <td className="px-3 py-2 text-gray-300">{line.description}</td>
                        <td className="px-3 py-2 font-mono text-right text-red-400">
                          {line.pension_gbp ? `−${formatGBP(line.pension_gbp)}` : ''}
                        </td>
                        <td className="px-3 py-2 font-mono text-right text-gray-400">
                          {line.rsu_shares || ''}
                        </td>
                        <td className="px-3 py-2 font-mono text-right">
                          {line.type === 'rsu' ? (
                            <span className={line.is_estimated ? 'italic text-yellow-400' : 'text-green-400'}>
                              {line.is_estimated ? '~' : ''}{formatGBP(line.rsu_value_gbp)}
                            </span>
                          ) : (
                            <span className="text-gray-300">{formatGBP(line.cash_gbp)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-right font-semibold text-brand">
                          {formatGBP(taxableGross)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Subtotal rows */}
                <tfoot>
                  <tr className="bg-surface-700 font-semibold text-xs">
                    <td className="px-3 py-2 text-gray-300" colSpan={3}>Total gross</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 font-mono text-right text-gray-300">
                      {formatGBP(tyBlock.subtotals.total_inc_rsu)}
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                  <tr className="bg-surface-700 font-semibold text-xs border-t border-surface-600">
                    <td className="px-3 py-2 text-brand" colSpan={3}>Taxable gross</td>
                    <td className="px-3 py-2 font-mono text-right text-red-400">
                      {tyBlock.subtotals.pension > 0 ? `−${formatGBP(tyBlock.subtotals.pension)}` : ''}
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 font-mono text-right text-brand">
                      {formatGBP(tyBlock.subtotals.total_inc_rsu - tyBlock.subtotals.pension)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })}
    </div>
  )
}
