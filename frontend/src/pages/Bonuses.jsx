import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import api from '../api'

function formatGBP(v) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v)
}

const MONTHS = [
  { n: 1, l: 'Jan' }, { n: 2, l: 'Feb' }, { n: 3, l: 'Mar' },
  { n: 4, l: 'Apr' }, { n: 5, l: 'May' }, { n: 6, l: 'Jun' },
  { n: 7, l: 'Jul' }, { n: 8, l: 'Aug' }, { n: 9, l: 'Sep' },
  { n: 10, l: 'Oct' }, { n: 11, l: 'Nov' }, { n: 12, l: 'Dec' },
]

const TODAY = new Date().toISOString().slice(0, 10)

function configStatus(cfg) {
  if (cfg.effective_from > TODAY) return 'expected'
  if (cfg.effective_to && cfg.effective_to < TODAY) return 'ended'
  return 'current'
}

const STATUS_BADGE = {
  current:  { label: 'Current',  cls: 'bg-green-900/40 text-green-400' },
  expected: { label: 'Expected', cls: 'bg-yellow-900/40 text-yellow-400' },
  ended:    { label: 'Ended',    cls: 'bg-red-900/40 text-red-400' },
}

const FREQ_BADGE = {
  monthly:   'bg-blue-900/40 text-blue-400',
  quarterly: 'bg-purple-900/40 text-purple-400',
  annual:    'bg-teal-900/40 text-teal-400',
  custom:    'bg-amber-900/40 text-amber-400',
}

const FREQ_LABELS = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  custom: 'Custom',
}

// Returns the 4 months in the quarterly pattern anchored on `anchor` (1–12), sorted ascending
function quarterlyPattern(anchor) {
  const months = []
  for (let i = 0; i < 4; i++) months.push(((anchor - 1 + i * 3) % 12) + 1)
  return months.sort((a, b) => a - b)
}

const EMPTY_FORM = {
  name: '', annual_amount: '', frequency: 'monthly', pay_months: [],
  effective_from: '', effective_to: '', notes: '',
}

export default function Bonuses() {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['bonuses'],
    queryFn: () => api.get('/bonuses').then((r) => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bonuses'] })

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/bonuses', data),
    onSuccess: () => { invalidate(); closeForm() },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/bonuses/${id}`, data),
    onSuccess: () => { invalidate(); closeForm() },
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/bonuses/${id}`),
    onSuccess: invalidate,
  })

  function openEdit(cfg) {
    setForm({
      name: cfg.name, annual_amount: cfg.annual_amount,
      frequency: cfg.frequency, pay_months: cfg.pay_months || [],
      effective_from: cfg.effective_from, effective_to: cfg.effective_to || '',
      notes: cfg.notes || '',
    })
    setEditingId(cfg.id)
    setShowForm(true)
  }

  function closeForm() { setForm(EMPTY_FORM); setEditingId(null); setShowForm(false) }

  function changeFrequency(f) {
    let pay_months = []
    if (f === 'quarterly') pay_months = quarterlyPattern(1) // default Jan/Apr/Jul/Oct
    setForm({ ...form, frequency: f, pay_months })
  }

  function clickMonth(n) {
    if (form.frequency === 'quarterly') {
      // Any click re-anchors the quarterly pattern on that month
      setForm({ ...form, pay_months: quarterlyPattern(n) })
    } else if (form.frequency === 'annual') {
      // Single selection — replace
      setForm({ ...form, pay_months: [n] })
    } else if (form.frequency === 'custom') {
      // Toggle freely
      setForm((f) => ({
        ...f,
        pay_months: f.pay_months.includes(n)
          ? f.pay_months.filter((m) => m !== n)
          : [...f.pay_months, n].sort((a, b) => a - b),
      }))
    }
  }

  function perPayment() {
    const amt = parseFloat(form.annual_amount)
    if (!amt) return null
    if (form.frequency === 'monthly') return amt / 12
    if (form.frequency === 'quarterly') return amt / 4
    if (form.frequency === 'annual') return amt
    if (form.frequency === 'custom') return form.pay_months.length ? amt / form.pay_months.length : null
    return null
  }

  function handleSubmit(e) {
    e.preventDefault()
    const needsMonths = form.frequency !== 'monthly'
    if (needsMonths && form.pay_months.length === 0) return
    const payload = {
      name: form.name,
      annual_amount: parseFloat(form.annual_amount),
      frequency: form.frequency,
      pay_months: needsMonths ? form.pay_months : [],
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      notes: form.notes || null,
    }
    if (editingId) updateMutation.mutate({ id: editingId, data: payload })
    else createMutation.mutate(payload)
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const showMonthPicker = form.frequency !== 'monthly'
  const pp = perPayment()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Bonus Configuration</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus size={15} /> Add bonus
        </button>
      </div>

      {showForm && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300">{editingId ? 'Edit Bonus' : 'Add Bonus'}</span>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-200"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Name</label>
                <input className="input" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">Annual Amount (£)</label>
                <input type="number" className="input" value={form.annual_amount}
                  onChange={(e) => setForm({ ...form, annual_amount: e.target.value })} required min={0} />
              </div>
              <div className="col-span-2">
                <label className="label">Frequency</label>
                <div className="flex gap-4 mt-1">
                  {['monthly', 'quarterly', 'annual', 'custom'].map((f) => (
                    <label key={f} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                      <input type="radio" name="frequency" value={f}
                        checked={form.frequency === f}
                        onChange={() => changeFrequency(f)}
                        className="accent-brand"
                      />
                      {FREQ_LABELS[f]}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {showMonthPicker && (
              <div>
                <div className="flex items-baseline gap-3 mb-2">
                  <label className="label mb-0">
                    {form.frequency === 'quarterly' && 'Pay months — click any month to anchor the quarterly schedule'}
                    {form.frequency === 'annual' && 'Pay month — select one'}
                    {form.frequency === 'custom' && 'Pay months — select any, bonus split evenly across them'}
                  </label>
                  {pp != null && (
                    <span className="text-xs text-gray-400">
                      {formatGBP(pp)} per payment
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {MONTHS.map(({ n, l }) => (
                    <button key={n} type="button"
                      onClick={() => clickMonth(n)}
                      className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                        form.pay_months.includes(n)
                          ? 'border-brand bg-brand/20 text-brand'
                          : 'border-surface-600 text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Effective From</label>
                <input type="date" className="input" value={form.effective_from}
                  onChange={(e) => setForm({ ...form, effective_from: e.target.value })} required />
              </div>
              <div>
                <label className="label">Effective To (optional)</label>
                <div className="flex items-center gap-2">
                  <input type="date" className="input flex-1" value={form.effective_to}
                    onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
                  {form.effective_to && (
                    <button type="button"
                      className="text-gray-500 hover:text-gray-300"
                      onClick={() => setForm({ ...form, effective_to: '' })}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="label">Notes</label>
              <input className="input" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button>
              <button type="submit" className="btn-primary flex items-center gap-2"
                disabled={isPending || (showMonthPicker && form.pay_months.length === 0)}>
                <Check size={14} /> {isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-surface-600 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 text-left whitespace-nowrap">Name</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Amount</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Frequency</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Pay Months</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">From</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">To</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            ) : configs.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No bonus configs yet</td></tr>
            ) : configs.map((cfg) => (
              <tr key={cfg.id} className="border-b border-surface-700 table-row-hover">
                <td className="px-4 py-3 text-gray-200 font-medium">{cfg.name}</td>
                <td className="px-4 py-3 font-mono text-brand font-semibold">{formatGBP(cfg.annual_amount)}/yr</td>
                <td className="px-4 py-3">
                  <span className={`badge ${FREQ_BADGE[cfg.frequency] ?? 'bg-surface-600 text-gray-400'}`}>
                    {FREQ_LABELS[cfg.frequency] ?? cfg.frequency}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-gray-400 text-xs">
                  {cfg.frequency !== 'monthly' && cfg.pay_months?.length
                    ? cfg.pay_months.map((m) => MONTHS[m - 1]?.l).join(', ')
                    : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-gray-300">{cfg.effective_from}</td>
                <td className="px-4 py-3 font-mono text-gray-300">{cfg.effective_to || '—'}</td>
                <td className="px-4 py-3">
                  {(() => { const s = STATUS_BADGE[configStatus(cfg)]; return <span className={`badge ${s.cls}`}>{s.label}</span> })()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end items-center gap-2">
                    {confirmDelete === cfg.id ? (
                      <>
                        <span className="text-xs text-red-400">Delete?</span>
                        <button onClick={() => { deleteMutation.mutate(cfg.id); setConfirmDelete(null) }}
                          className="text-xs font-medium text-red-400 hover:text-red-300">Yes</button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="text-xs text-gray-400 hover:text-gray-200">No</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => openEdit(cfg)} className="text-gray-400 hover:text-gray-200"><Pencil size={14} /></button>
                        <button onClick={() => setConfirmDelete(cfg.id)} className="text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
