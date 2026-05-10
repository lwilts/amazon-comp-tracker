import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import api from '../api'

function formatAmount(cfg) {
  return cfg.amount_type === 'percentage'
    ? `${cfg.amount}%`
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(cfg.amount) + '/mo'
}

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

const EMPTY_FORM = { amount_type: 'percentage', amount: '', effective_from: '', effective_to: '', notes: '' }

export default function Pension() {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['pension'],
    queryFn: () => api.get('/pension').then((r) => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pension'] })
    qc.invalidateQueries({ queryKey: ['schedule'] })
  }

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/pension', data),
    onSuccess: () => { invalidate(); closeForm() },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/pension/${id}`, data),
    onSuccess: () => { invalidate(); closeForm() },
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/pension/${id}`),
    onSuccess: invalidate,
  })

  function openEdit(cfg) {
    setForm({
      amount_type: cfg.amount_type,
      amount: cfg.amount,
      effective_from: cfg.effective_from,
      effective_to: cfg.effective_to || '',
      notes: cfg.notes || '',
    })
    setEditingId(cfg.id)
    setShowForm(true)
  }

  function closeForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      amount_type: form.amount_type,
      amount: parseFloat(form.amount),
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      notes: form.notes || null,
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Salary Sacrifice</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus size={15} /> Add salary sacrifice
        </button>
      </div>

      {showForm && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300">
              {editingId ? 'Edit Salary Sacrifice' : 'Add Salary Sacrifice'}
            </span>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-200"><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.amount_type}
                onChange={(e) => setForm({ ...form, amount_type: e.target.value })}
              >
                <option value="percentage">% of base salary</option>
                <option value="fixed">Fixed monthly amount (£)</option>
              </select>
            </div>
            <div>
              <label className="label">
                {form.amount_type === 'percentage' ? 'Contribution (%)' : 'Monthly Amount (£)'}
              </label>
              <input
                type="number"
                className="input"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
                min={0}
                step={form.amount_type === 'percentage' ? 0.01 : 1}
              />
            </div>
            <div>
              <label className="label">Effective From</label>
              <input
                type="date"
                className="input"
                value={form.effective_from}
                onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Effective To (optional)</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="input flex-1"
                  value={form.effective_to}
                  onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
                />
                {form.effective_to && (
                  <button type="button"
                    className="text-gray-500 hover:text-gray-300"
                    onClick={() => setForm({ ...form, effective_to: '' })}>
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <input
                type="text"
                className="input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="optional"
              />
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button>
              <button type="submit" className="btn-primary flex items-center gap-2" disabled={isPending}>
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
              <th className="px-4 py-3 text-left whitespace-nowrap">Contribution</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Type</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Effective From</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Effective To</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Notes</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            ) : configs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No salary sacrifice entries added</td></tr>
            ) : configs.map((cfg) => (
              <tr key={cfg.id} className="border-b border-surface-700 table-row-hover">
                <td className="px-4 py-3 font-mono text-brand font-semibold">{formatAmount(cfg)}</td>
                <td className="px-4 py-3 text-gray-400">
                  {cfg.amount_type === 'percentage' ? '% of base salary' : 'Fixed monthly'}
                </td>
                <td className="px-4 py-3 font-mono text-gray-300">{cfg.effective_from}</td>
                <td className="px-4 py-3 font-mono text-gray-300">{cfg.effective_to || '—'}</td>
                <td className="px-4 py-3">
                  {(() => { const s = STATUS_BADGE[configStatus(cfg)]; return <span className={`badge ${s.cls}`}>{s.label}</span> })()}
                </td>
                <td className="px-4 py-3 text-gray-400">{cfg.notes || '—'}</td>
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
