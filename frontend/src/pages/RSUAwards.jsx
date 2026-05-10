import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, Lock, RotateCcw } from 'lucide-react'
import api from '../api'

function fmt(v, decimals = 0) {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: decimals }).format(v)
}

const TODAY = new Date().toISOString().slice(0, 10)

function vestStatus(vest) {
  const isPast = vest.vest_date < TODAY
  if (vest.manually_overridden) return isPast ? 'confirmed' : 'speculative'
  if (isPast) return 'estimated'
  return 'projected'
}

const STATUS_CFG = {
  projected:   { label: 'Projected',   badgeCls: 'bg-surface-600 text-gray-400 italic',  icon: false },
  estimated:   { label: 'Estimated',   badgeCls: 'bg-green-900/40 text-green-400',        icon: false },
  confirmed:   { label: 'Confirmed',   badgeCls: 'bg-green-900/40 text-green-400',        icon: true  },
  speculative: { label: 'Speculative', badgeCls: 'bg-amber-900/40 text-amber-400',        icon: true  },
}

const VALUE_CLS = {
  projected:   'italic text-yellow-400',
  estimated:   'text-green-400',
  confirmed:   'text-green-400',
  speculative: 'text-amber-400',
}

function StatusBadge({ vest }) {
  const { label, badgeCls, icon } = STATUS_CFG[vestStatus(vest)]
  return (
    <span className={`badge ${badgeCls}`}>
      {icon && <Lock size={10} className="mr-1 inline" />}
      {label}
    </span>
  )
}

// Inline editable cell — clicking shows an input; Enter/✓ commits, Escape/blur cancels
function EditCell({ active, value, onChange, onCommit, onCancel, step = '0.01', width = 'w-20' }) {
  if (!active) return null
  return (
    <div className="flex items-center justify-end gap-1">
      <input
        autoFocus
        type="number"
        className={`${width} rounded bg-surface-600 border border-surface-500 px-1 py-0.5 text-xs text-right font-mono text-gray-100 focus:outline-none focus:border-brand`}
        value={value}
        step={step}
        min="0"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCommit}
        className="text-green-400 hover:text-green-300"
      >
        <Check size={12} />
      </button>
    </div>
  )
}

const EMPTY_AWARD   = { award_ref: '', grant_date: '', notes: '' }
const EMPTY_VEST    = { vest_date: '', shares: '', notes: '' }
const EMPTY_STARTER = { award_ref: '', grant_date: '', total_shares: '', notes: '' }

const STARTER_SCHEDULE = [
  { months: 12, pct: 0.05 },
  { months: 24, pct: 0.15 },
  { months: 30, pct: 0.20 },
  { months: 36, pct: 0.20 },
  { months: 42, pct: 0.20 },
  { months: 48, pct: 0.20 },
]

function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1 + months, d)
  return dt.toISOString().slice(0, 10)
}

function calcStarterVests(grantDate, totalShares) {
  let allocated = 0
  return STARTER_SCHEDULE.map(({ months, pct }, i) => {
    const shares = i < STARTER_SCHEDULE.length - 1
      ? Math.floor(totalShares * pct)
      : totalShares - allocated
    allocated += shares
    return { vest_date: addMonths(grantDate, months), shares, pct }
  })
}

export default function RSUAwards() {
  const qc = useQueryClient()
  const [expanded,      setExpanded]      = useState(new Set())
  const [awardForm,     setAwardForm]      = useState(null)
  const [vestForm,      setVestForm]       = useState(null)
  const [starterForm,   setStarterForm]    = useState(null)
  const [starterLoading, setStarterLoading] = useState(false)
  const [starterError,  setStarterError]   = useState(null)
  const [editingCell,   setEditingCell]    = useState(null)  // { vest, field } | null
  const [editValue,     setEditValue]      = useState('')
  const [unfixConfirm,  setUnfixConfirm]   = useState(null)
  const [confirmDelete, setConfirmDelete]  = useState(null) // { type: 'award'|'vest', id }

  const { data: awards = [], isLoading } = useQuery({
    queryKey: ['rsu-awards'],
    queryFn: () => api.get('/rsu/awards').then((r) => r.data),
  })

  const { data: prices } = useQuery({
    queryKey: ['prices'],
    queryFn: () => api.get('/prices/current').then((r) => r.data),
    retry: false,
  })

  function vestValue(vest) {
    if (vest.is_locked) return vest.locked_value_gbp
    if (!prices) return null
    return vest.shares * prices.amzn_usd * prices.usd_gbp
  }

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['rsu-awards'] })
    qc.invalidateQueries({ queryKey: ['schedule'] })
  }

  const createAward = useMutation({ mutationFn: (d) => api.post('/rsu/awards', d),               onSuccess: () => { inv(); setAwardForm(null) } })
  const updateAward = useMutation({ mutationFn: ({ id, d }) => api.put(`/rsu/awards/${id}`, d),  onSuccess: () => { inv(); setAwardForm(null) } })
  const deleteAward = useMutation({ mutationFn: (id) => api.delete(`/rsu/awards/${id}`),          onSuccess: inv })

  const createVest  = useMutation({ mutationFn: (d) => api.post('/rsu/vests', d),                onSuccess: () => { inv(); setVestForm(null) } })
  const updateVest  = useMutation({ mutationFn: ({ id, d }) => api.put(`/rsu/vests/${id}`, d),   onSuccess: () => { inv(); setVestForm(null) } })
  const deleteVest  = useMutation({ mutationFn: (id) => api.delete(`/rsu/vests/${id}`),           onSuccess: inv })
  const lockVest    = useMutation({ mutationFn: ({ id, d }) => api.post(`/rsu/vests/${id}/lock`, d), onSuccess: inv })
  const unlockVest  = useMutation({
    mutationFn: (id) => api.post(`/rsu/vests/${id}/unlock`),
    onSuccess: () => { inv(); setUnfixConfirm(null) },
  })

  function toggleExpand(id) {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function submitAward(e) {
    e.preventDefault()
    const { id, data } = awardForm
    id ? updateAward.mutate({ id, d: data }) : createAward.mutate(data)
  }

  function submitVest(e) {
    e.preventDefault()
    const { awardId, vestId, data } = vestForm
    const payload = { ...data, shares: parseInt(data.shares), award_id: awardId }
    vestId ? updateVest.mutate({ id: vestId, d: payload }) : createVest.mutate(payload)
  }

  async function submitStarterAward(e) {
    e.preventDefault()
    setStarterError(null)
    setStarterLoading(true)
    try {
      const { award_ref, grant_date, total_shares, notes } = starterForm
      const award = await api.post('/rsu/awards', {
        award_ref, grant_date, notes: notes || null,
      }).then((r) => r.data)
      const vests = calcStarterVests(grant_date, parseInt(total_shares))
      await Promise.all(vests.map((v) => api.post('/rsu/vests', { award_id: award.id, vest_date: v.vest_date, shares: v.shares, notes: null })))
      inv()
      setExpanded((s) => new Set([...s, award.id]))
      setStarterForm(null)
    } catch {
      setStarterError('Something went wrong — please try again.')
    } finally {
      setStarterLoading(false)
    }
  }

  function startEdit(vest, field) {
    let val = ''
    if (field === 'price') {
      val = vest.locked_price_usd != null
        ? String(vest.locked_price_usd)
        : prices?.amzn_usd?.toFixed(2) ?? ''
    } else if (field === 'fx') {
      val = vest.locked_fx_rate != null
        ? String(vest.locked_fx_rate)
        : prices?.usd_gbp?.toFixed(4) ?? ''
    } else if (field === 'gbp') {
      val = vest.locked_value_gbp != null
        ? String(vest.locked_value_gbp)
        : prices ? (vest.shares * prices.amzn_usd * prices.usd_gbp).toFixed(2) : ''
    }
    setEditingCell({ vest, field })
    setEditValue(val)
  }

  function cancelEdit() {
    setEditingCell(null)
    setEditValue('')
  }

  function commitEdit() {
    if (!editingCell) return
    const val = parseFloat(editValue)
    if (isNaN(val) || val <= 0) { cancelEdit(); return }

    const { vest, field } = editingCell
    const payload = {}

    if (field === 'price') {
      payload.locked_price_usd = val
      // Auto-lock current FX on an unlocked vest so GBP value can be computed
      if (!vest.is_locked && prices) payload.locked_fx_rate = prices.usd_gbp
    } else if (field === 'fx') {
      payload.locked_fx_rate = val
      // Auto-lock current price on an unlocked vest
      if (!vest.is_locked && prices) payload.locked_price_usd = prices.amzn_usd
    } else if (field === 'gbp') {
      payload.locked_value_gbp = val
    }

    lockVest.mutate({ id: vest.id, d: payload })
    cancelEdit()
  }

  function handleReset(vest) {
    vest.vest_date < TODAY ? setUnfixConfirm(vest) : unlockVest.mutate(vest.id)
  }

  function isEditing(vest, field) {
    return editingCell?.vest.id === vest.id && editingCell?.field === field
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-100">RSU Awards</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary flex items-center gap-2" onClick={() => { setStarterForm(EMPTY_STARTER); setStarterError(null) }}>
            <Plus size={15} /> New starter award
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setAwardForm({ data: EMPTY_AWARD })}>
            <Plus size={15} /> Add award
          </button>
        </div>
      </div>

      {/* Award form */}
      {awardForm && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300">{awardForm.id ? 'Edit Award' : 'Add Award'}</span>
            <button onClick={() => setAwardForm(null)} className="text-gray-400 hover:text-gray-200"><X size={16} /></button>
          </div>
          <form onSubmit={submitAward} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Award Reference</label>
              <input className="input" value={awardForm.data.award_ref}
                onChange={(e) => setAwardForm({ ...awardForm, data: { ...awardForm.data, award_ref: e.target.value } })}
                required placeholder="e.g. GRANT-2025-A" />
            </div>
            <div>
              <label className="label">Grant Date</label>
              <input type="date" className="input" value={awardForm.data.grant_date}
                onChange={(e) => setAwardForm({ ...awardForm, data: { ...awardForm.data, grant_date: e.target.value } })}
                required />
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" value={awardForm.data.notes}
                onChange={(e) => setAwardForm({ ...awardForm, data: { ...awardForm.data, notes: e.target.value } })}
                placeholder="optional" />
            </div>
            <div className="col-span-1 flex justify-end gap-2 sm:col-span-3">
              <button type="button" className="btn-secondary" onClick={() => setAwardForm(null)}>Cancel</button>
              <button type="submit" className="btn-primary flex items-center gap-2" disabled={createAward.isPending || updateAward.isPending}>
                <Check size={14} /> Save
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {awards.map((award) => (
        <div key={award.id} className="card p-0 overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-700 transition-colors"
            onClick={() => toggleExpand(award.id)}
          >
            <div className="flex items-center gap-3">
              {expanded.has(award.id) ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
              <span className="font-mono font-semibold text-brand">{award.award_ref}</span>
              <span className="text-sm text-gray-400">Grant: {award.grant_date}</span>
              <span className="badge bg-surface-600 text-gray-400">{award.vests.length} vests · {award.vests.reduce((s, v) => s + v.shares, 0)} shares</span>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {confirmDelete?.type === 'award' && confirmDelete.id === award.id ? (
                <>
                  <span className="text-xs text-red-400">Delete award?</span>
                  <button onClick={() => { deleteAward.mutate(award.id); setConfirmDelete(null) }}
                    className="text-xs font-medium text-red-400 hover:text-red-300">Yes</button>
                  <button onClick={() => setConfirmDelete(null)}
                    className="text-xs text-gray-400 hover:text-gray-200">No</button>
                </>
              ) : (
                <>
                  <button onClick={() => setAwardForm({ id: award.id, data: { award_ref: award.award_ref, grant_date: award.grant_date, notes: award.notes || '' } })}
                    className="text-gray-400 hover:text-gray-200"><Pencil size={14} /></button>
                  <button onClick={() => setConfirmDelete({ type: 'award', id: award.id })}
                    className="text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>
                </>
              )}
            </div>
          </div>

          {expanded.has(award.id) && (
            <div className="border-t border-surface-600">
              <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-surface-600 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2 text-left whitespace-nowrap">Vest Date</th>
                    <th className="px-4 py-2 text-right whitespace-nowrap">Shares</th>
                    <th className="px-4 py-2 text-left whitespace-nowrap">Status</th>
                    <th className="px-4 py-2 text-right whitespace-nowrap">AMZN (USD)</th>
                    <th className="px-4 py-2 text-right whitespace-nowrap">FX Rate</th>
                    <th className="px-4 py-2 text-right whitespace-nowrap">GBP Value</th>
                    <th className="px-4 py-2 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {award.vests.sort((a, b) => a.vest_date.localeCompare(b.vest_date)).map((vest) => {
                    const status = vestStatus(vest)
                    const vcls   = VALUE_CLS[status]
                    const lockedCls = `cursor-text select-none rounded px-1 hover:bg-surface-600 ${vcls}`
                    const unlockedCls = 'cursor-text select-none rounded px-1 hover:bg-surface-600 italic text-yellow-400'

                    return (
                      <tr key={vest.id} className="border-b border-surface-700 table-row-hover">
                        <td className="px-4 py-2 font-mono text-gray-300">{vest.vest_date}</td>
                        <td className="px-4 py-2 font-mono text-right text-gray-200">{vest.shares}</td>
                        <td className="px-4 py-2"><StatusBadge vest={vest} /></td>

                        {/* AMZN price */}
                        <td className="px-4 py-2 font-mono text-right">
                          <EditCell
                            active={isEditing(vest, 'price')}
                            value={editValue} onChange={setEditValue}
                            onCommit={commitEdit} onCancel={cancelEdit}
                            step="0.01"
                          />
                          {!isEditing(vest, 'price') && (
                            vest.is_locked
                              ? <span className={lockedCls} onClick={() => startEdit(vest, 'price')}>${vest.locked_price_usd?.toFixed(2)}</span>
                              : prices
                                ? <span className={unlockedCls} onClick={() => startEdit(vest, 'price')}>~${prices.amzn_usd.toFixed(2)}</span>
                                : <span className="text-gray-500">—</span>
                          )}
                        </td>

                        {/* FX rate */}
                        <td className="px-4 py-2 font-mono text-right">
                          <EditCell
                            active={isEditing(vest, 'fx')}
                            value={editValue} onChange={setEditValue}
                            onCommit={commitEdit} onCancel={cancelEdit}
                            step="0.0001"
                          />
                          {!isEditing(vest, 'fx') && (
                            vest.is_locked
                              ? <span className={lockedCls} onClick={() => startEdit(vest, 'fx')}>{vest.locked_fx_rate?.toFixed(4)}</span>
                              : prices
                                ? <span className={unlockedCls} onClick={() => startEdit(vest, 'fx')}>~{prices.usd_gbp.toFixed(4)}</span>
                                : <span className="text-gray-500">—</span>
                          )}
                        </td>

                        {/* GBP value — editable */}
                        <td className="px-4 py-2 font-mono text-right font-semibold">
                          {isEditing(vest, 'gbp') ? (
                            <EditCell
                              active
                              value={editValue} onChange={setEditValue}
                              onCommit={commitEdit} onCancel={cancelEdit}
                              step="0.01" width="w-24"
                            />
                          ) : (
                            <span
                              className={`${vcls} cursor-text select-none rounded px-1 hover:bg-surface-600`}
                              onClick={() => startEdit(vest, 'gbp')}
                            >
                              {status === 'projected' ? '~' : ''}{fmt(vestValue(vest))}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end items-center gap-2">
                            {confirmDelete?.type === 'vest' && confirmDelete.id === vest.id ? (
                              <>
                                <span className="text-xs text-red-400">Delete?</span>
                                <button onClick={() => { deleteVest.mutate(vest.id); setConfirmDelete(null) }}
                                  className="text-xs font-medium text-red-400 hover:text-red-300">Yes</button>
                                <button onClick={() => setConfirmDelete(null)}
                                  className="text-xs text-gray-400 hover:text-gray-200">No</button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setVestForm({ awardId: award.id, vestId: vest.id, data: { vest_date: vest.vest_date, shares: vest.shares, notes: vest.notes || '' } })}
                                  className="text-gray-400 hover:text-gray-200" title="Edit vest"
                                ><Pencil size={13} /></button>
                                {vest.manually_overridden && (
                                  <button onClick={() => handleReset(vest)}
                                    className="text-gray-400 hover:text-yellow-400" title="Reset to estimated">
                                    <RotateCcw size={13} />
                                  </button>
                                )}
                                <button onClick={() => setConfirmDelete({ type: 'vest', id: vest.id })}
                                  className="text-gray-400 hover:text-red-400" title="Delete"><Trash2 size={13} /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              <div className="px-4 py-2 border-t border-surface-600">
                <button className="btn-secondary text-xs flex items-center gap-1"
                  onClick={() => setVestForm({ awardId: award.id, data: EMPTY_VEST })}>
                  <Plus size={12} /> Add vest
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Vest form modal */}
      {vestForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-300">{vestForm.vestId ? 'Edit Vest' : 'Add Vest'}</span>
              <button onClick={() => setVestForm(null)} className="text-gray-400 hover:text-gray-200"><X size={16} /></button>
            </div>
            <form onSubmit={submitVest} className="space-y-3">
              <div>
                <label className="label">Vest Date</label>
                <input type="date" className="input" value={vestForm.data.vest_date}
                  onChange={(e) => setVestForm({ ...vestForm, data: { ...vestForm.data, vest_date: e.target.value } })} required />
              </div>
              <div>
                <label className="label">Shares</label>
                <input type="number" className="input" value={vestForm.data.shares}
                  onChange={(e) => setVestForm({ ...vestForm, data: { ...vestForm.data, shares: e.target.value } })} required min={1} />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={vestForm.data.notes}
                  onChange={(e) => setVestForm({ ...vestForm, data: { ...vestForm.data, notes: e.target.value } })} placeholder="optional" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-secondary" onClick={() => setVestForm(null)}>Cancel</button>
                <button type="submit" className="btn-primary flex items-center gap-2" disabled={createVest.isPending || updateVest.isPending}>
                  <Check size={14} /> Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New starter award helper */}
      {starterForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-300">New Starter Award</span>
              <button onClick={() => setStarterForm(null)} className="text-gray-400 hover:text-gray-200"><X size={16} /></button>
            </div>
            <form onSubmit={submitStarterAward} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Grant Reference</label>
                  <input className="input" value={starterForm.award_ref}
                    onChange={(e) => setStarterForm({ ...starterForm, award_ref: e.target.value })}
                    required placeholder="e.g. GRANT-2025-A" />
                </div>
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" value={starterForm.grant_date}
                    onChange={(e) => setStarterForm({ ...starterForm, award_ref: starterForm.award_ref, grant_date: e.target.value })}
                    required />
                </div>
                <div>
                  <label className="label">Total RSUs</label>
                  <input type="number" className="input" value={starterForm.total_shares}
                    onChange={(e) => setStarterForm({ ...starterForm, total_shares: e.target.value })}
                    required min={1} step={1} placeholder="e.g. 500" />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input className="input" value={starterForm.notes}
                    onChange={(e) => setStarterForm({ ...starterForm, notes: e.target.value })}
                    placeholder="optional" />
                </div>
              </div>

              {starterForm.grant_date && starterForm.total_shares > 0 && (() => {
                const vests = calcStarterVests(starterForm.grant_date, parseInt(starterForm.total_shares) || 0)
                return (
                  <div>
                    <p className="label mb-1">Vesting schedule preview</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-surface-600 text-gray-500 uppercase tracking-wide">
                          <th className="py-1 text-left">Vest Date</th>
                          <th className="py-1 text-right">Shares</th>
                          <th className="py-1 text-right">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vests.map((v, i) => (
                          <tr key={i} className="border-b border-surface-700">
                            <td className="py-1 font-mono text-gray-300">{v.vest_date}</td>
                            <td className="py-1 font-mono text-right text-gray-200">{v.shares}</td>
                            <td className="py-1 font-mono text-right text-gray-400">{Math.round(v.pct * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="text-gray-400 font-semibold">
                          <td className="pt-1">Total</td>
                          <td className="pt-1 font-mono text-right text-gray-200">{vests.reduce((s, v) => s + v.shares, 0)}</td>
                          <td className="pt-1 font-mono text-right">100%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}

              {starterError && <p className="text-sm text-red-400">{starterError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-secondary" onClick={() => setStarterForm(null)}>Cancel</button>
                <button type="submit" className="btn-primary flex items-center gap-2" disabled={starterLoading}>
                  <Check size={14} /> {starterLoading ? 'Creating…' : 'Create award & vests'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset confirmation (past vests only) */}
      {unfixConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-300">Reset to estimated?</span>
              <button onClick={() => setUnfixConfirm(null)} className="text-gray-400 hover:text-gray-200"><X size={16} /></button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              This will replace your fixed values for{' '}
              <span className="font-mono text-gray-200">{unfixConfirm.vest_date}</span>{' '}
              with the historical market data for that date.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setUnfixConfirm(null)}>Cancel</button>
              <button className="btn-primary flex items-center gap-2"
                onClick={() => unlockVest.mutate(unfixConfirm.id)}
                disabled={unlockVest.isPending}>
                <RotateCcw size={14} /> Reset to estimated
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
