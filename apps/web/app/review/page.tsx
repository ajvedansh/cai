'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, promoteReviewItem, rejectReviewItem } from '@/lib/api'
import { StatusBadge } from '@/components/Badge'
import type { ReviewItem } from '@/lib/types'
import { Segment, Direction, ReviewStatus } from '@/lib/types'
import { format } from 'date-fns'
import clsx from 'clsx'

function PromoteModal({ item, onClose, onDone }: { item: ReviewItem; onClose: () => void; onDone: () => void }) {
  const pf = item.partial_fields as any
  const [inst, setInst] = useState(pf?.instrument ?? '')
  const [seg, setSeg] = useState<Segment>(pf?.segment ?? Segment.EQUITY)
  const [dir, setDir] = useState<Direction>(pf?.direction ?? Direction.BUY)
  const [entry, setEntry] = useState(String(pf?.entry_price ?? ''))
  const [sl, setSl] = useState(String(pf?.stop_loss ?? ''))
  const [t1, setT1] = useState(String(pf?.targets?.[0] ?? ''))
  const [t2, setT2] = useState(String(pf?.targets?.[1] ?? ''))
  const [t3, setT3] = useState(String(pf?.targets?.[2] ?? ''))
  const [trailing, setTrailing] = useState(pf?.trailing_sl ?? false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    const targets = [t1, t2, t3].filter(Boolean).map(Number)
    if (!inst || !entry || !sl || targets.length === 0) {
      setErr('Instrument, entry, SL and at least 1 target are required'); return
    }
    setBusy(true); setErr('')
    const res = await promoteReviewItem(item._id, {
      instrument: inst, segment: seg, direction: dir,
      entry_price: Number(entry), stop_loss: Number(sl),
      targets, trailing_sl: trailing,
    })
    setBusy(false)
    if (!res.success) setErr('Promotion failed')
    else onDone()
  }

  const inputCls = 'w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo/50'
  const labelCls = 'block text-[10px] text-slate-500 uppercase tracking-wider mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-xl w-full max-w-lg shadow-2xl animate-fadeIn">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-white">Promote to Trade Call</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
        </div>

        {/* Raw message */}
        <div className="px-5 pt-4">
          <div className={labelCls}>Original Message</div>
          <div className="bg-bg-tertiary rounded-lg p-3 font-mono text-xs text-slate-400 leading-relaxed line-clamp-3">
            {item.raw_text}
          </div>
          <div className="mt-1 text-[10px] text-amber">{item.reason}</div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Instrument *</label>
              <input className={inputCls} value={inst} onChange={e => setInst(e.target.value.toUpperCase())} placeholder="e.g. RELIANCE" />
            </div>
            <div>
              <label className={labelCls}>Segment</label>
              <select className={inputCls} value={seg} onChange={e => setSeg(e.target.value as Segment)}>
                {Object.values(Segment).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Direction</label>
              <select className={inputCls} value={dir} onChange={e => setDir(e.target.value as Direction)}>
                {Object.values(Direction).map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Entry Price *</label>
              <input className={inputCls} type="number" value={entry} onChange={e => setEntry(e.target.value)} placeholder="2850" />
            </div>
            <div>
              <label className={labelCls}>Stop Loss *</label>
              <input className={inputCls} type="number" value={sl} onChange={e => setSl(e.target.value)} placeholder="2780" />
            </div>
            <div>
              <label className={labelCls}>Target 1 *</label>
              <input className={inputCls} type="number" value={t1} onChange={e => setT1(e.target.value)} placeholder="2920" />
            </div>
            <div>
              <label className={labelCls}>Target 2</label>
              <input className={inputCls} type="number" value={t2} onChange={e => setT2(e.target.value)} placeholder="2960" />
            </div>
            <div>
              <label className={labelCls}>Target 3</label>
              <input className={inputCls} type="number" value={t3} onChange={e => setT3(e.target.value)} placeholder="3000" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={trailing} onChange={e => setTrailing(e.target.checked)}
              className="rounded border-border" />
            <span className="text-sm text-slate-400">Trailing Stop-Loss</span>
          </label>

          {err && <div className="bg-red/10 border border-red/30 rounded px-3 py-2 text-sm text-red">{err}</div>}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 bg-bg-tertiary border border-border text-slate-400 text-sm rounded-lg hover:text-white">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 px-4 py-2 bg-green/20 border border-green/30 text-green text-sm font-medium rounded-lg hover:bg-green/30 disabled:opacity-50"
            >
              {busy ? 'Promoting…' : '✓ Promote to Active'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReviewPage() {
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | ''>('PENDING' as ReviewStatus)
  const [promoting, setPromoting] = useState<ReviewItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const qs = statusFilter ? `?status=${statusFilter}` : ''
  const { data, mutate } = useSWR(`/api/review${qs}`, fetcher, { refreshInterval: 10000 })
  const items: ReviewItem[] = data?.data ?? []

  async function reject(id: string) {
    setBusy(id); setError('')
    const res = await rejectReviewItem(id)
    setBusy(null)
    if (!res.success) setError('Reject failed')
    else mutate()
  }

  const pending = items.filter(i => i.status === ReviewStatus.PENDING)
  const done = items.filter(i => i.status !== ReviewStatus.PENDING)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Review Queue</h1>
          <p className="text-sm text-slate-500">{pending.length} pending · {done.length} resolved</p>
        </div>
        <div className="flex gap-2">
          {(['', 'PENDING', 'PROMOTED', 'REJECTED'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s as any)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === s
                  ? 'bg-indigo/20 border border-indigo/30 text-indigo'
                  : 'bg-bg-tertiary border border-border text-slate-400 hover:text-white'
              )}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-red/10 border border-red/30 rounded-lg px-4 py-2 text-sm text-red">{error}</div>}

      {items.length === 0 && (
        <div className="bg-bg-secondary border border-border rounded-xl py-16 text-center text-slate-600">
          <div className="text-3xl mb-2">✓</div>
          <div>Queue is empty</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map(item => {
          const pf = item.partial_fields as any
          return (
            <div key={item._id} className="bg-bg-secondary border border-border rounded-xl overflow-hidden hover:border-slate-600 transition-colors">
              {/* Card Header */}
              <div className="flex items-start justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={item.status} />
                  <span className="badge badge-pending text-[10px]">
                    {Math.round(item.confidence * 100)}% conf
                  </span>
                  <span className="text-[10px] text-slate-600 font-mono">{item.source_channel}</span>
                </div>
                <span className="text-[10px] text-slate-600 font-mono shrink-0">
                  {item.createdAt ? format(new Date(item.createdAt), 'dd MMM HH:mm') : ''}
                </span>
              </div>

              {/* Raw text */}
              <div className="px-4 py-3">
                <div className="font-mono text-xs text-slate-400 leading-relaxed bg-bg-tertiary rounded-lg p-3">
                  {item.raw_text}
                </div>
                <div className="mt-2 text-[10px] text-amber">Reason: {item.reason}</div>
              </div>

              {/* Partial fields */}
              {Object.keys(item.partial_fields ?? {}).length > 0 && (
                <div className="px-4 pb-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Extracted Fields</div>
                  <div className="flex flex-wrap gap-2">
                    {pf?.instrument && (
                      <span className="font-mono text-xs bg-indigo/10 border border-indigo/20 text-indigo px-2 py-0.5 rounded">
                        {pf.instrument}
                      </span>
                    )}
                    {pf?.direction && (
                      <span className={clsx(
                        'font-mono text-xs px-2 py-0.5 rounded border',
                        pf.direction === 'BUY' ? 'bg-green/10 border-green/20 text-green' : 'bg-red/10 border-red/20 text-red'
                      )}>
                        {pf.direction}
                      </span>
                    )}
                    {pf?.entry_price && (
                      <span className="font-mono text-xs bg-bg-tertiary border border-border text-slate-300 px-2 py-0.5 rounded">
                        @ {pf.entry_price}
                      </span>
                    )}
                    {pf?.stop_loss && (
                      <span className="font-mono text-xs bg-red/10 border border-red/20 text-red px-2 py-0.5 rounded">
                        SL {pf.stop_loss}
                      </span>
                    )}
                    {pf?.targets?.length > 0 && (
                      <span className="font-mono text-xs bg-green/10 border border-green/20 text-green px-2 py-0.5 rounded">
                        TGT {pf.targets.join(', ')}
                      </span>
                    )}
                    {pf?.missing_fields?.length > 0 && (
                      <span className="font-mono text-xs bg-amber/10 border border-amber/20 text-amber px-2 py-0.5 rounded">
                        Missing: {pf.missing_fields.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              {item.status === ReviewStatus.PENDING && (
                <div className="flex border-t border-border">
                  <button
                    onClick={() => reject(item._id)}
                    disabled={busy === item._id}
                    className="flex-1 py-2.5 text-xs font-medium text-red hover:bg-red/10 transition-colors border-r border-border disabled:opacity-50"
                  >
                    {busy === item._id ? '…' : '✕ Reject'}
                  </button>
                  <button
                    onClick={() => setPromoting(item)}
                    className="flex-1 py-2.5 text-xs font-medium text-green hover:bg-green/10 transition-colors"
                  >
                    ✓ Promote
                  </button>
                </div>
              )}
              {item.status !== ReviewStatus.PENDING && (
                <div className="px-4 py-2.5 border-t border-border text-xs text-slate-600">
                  {item.reviewed_by && `Reviewed by ${item.reviewed_by}`}
                  {item.reviewed_at && ` · ${format(new Date(item.reviewed_at), 'dd MMM HH:mm')}`}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {promoting && (
        <PromoteModal
          item={promoting}
          onClose={() => setPromoting(null)}
          onDone={() => { setPromoting(null); mutate() }}
        />
      )}
    </div>
  )
}
