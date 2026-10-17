'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, updateTradeCallStatus } from '@/lib/api'
import { DirectionBadge, SegmentBadge, StatusBadge } from '@/components/Badge'
import type { TradeCall } from '@/lib/types'
import { TradeCallStatus, Segment, ALLOWED_TRANSITIONS } from '@/lib/types'
import { format } from 'date-fns'
import Link from 'next/link'
import clsx from 'clsx'

const SEGMENTS = ['', ...Object.values(Segment)]
const STATUSES = ['', ...Object.values(TradeCallStatus)]

export default function TradeCallsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('')
  const [instrument, setInstrument] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const qs = new URLSearchParams()
  if (statusFilter) qs.set('status', statusFilter)
  if (segmentFilter) qs.set('segment', segmentFilter)
  if (instrument) qs.set('instrument', instrument)
  qs.set('page', String(page))
  qs.set('limit', '20')

  const { data, mutate, isLoading } = useSWR(`/api/trade-calls?${qs}`, fetcher, { refreshInterval: 15000 })
  const calls: TradeCall[] = data?.data ?? []
  const meta = data?.meta ?? { total: 0, page: 1, limit: 20 }

  async function changeStatus(id: string, status: TradeCallStatus) {
    setBusy(id)
    setError('')
    const res = await updateTradeCallStatus(id, status)
    setBusy(null)
    if (!res.success) setError('Status update failed. Invalid transition?')
    else mutate()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Trade Calls</h1>
          <p className="text-sm text-slate-500">{meta.total} total signals</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-bg-secondary border border-border rounded-xl p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[140px]">
          <input
            className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo/50"
            placeholder="Search instrument…"
            value={instrument}
            onChange={e => { setInstrument(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo/50"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">All Status</option>
          {Object.values(TradeCallStatus).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          className="bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo/50"
          value={segmentFilter}
          onChange={e => { setSegmentFilter(e.target.value); setPage(1) }}
        >
          <option value="">All Segments</option>
          {Object.values(Segment).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(statusFilter || segmentFilter || instrument) && (
          <button
            onClick={() => { setStatusFilter(''); setSegmentFilter(''); setInstrument(''); setPage(1) }}
            className="text-xs text-slate-500 hover:text-slate-300 px-2"
          >
            Clear ×
          </button>
        )}
      </div>

      {error && <div className="bg-red/10 border border-red/30 rounded-lg px-4 py-2 text-sm text-red">{error}</div>}

      {/* Table */}
      <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-3">Instrument</th>
                <th className="text-left px-4 py-3">Entry</th>
                <th className="text-left px-4 py-3">SL</th>
                <th className="text-left px-4 py-3">Targets</th>
                <th className="text-left px-4 py-3">Confidence</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="skeleton h-4 w-20" /></td>
                  ))}
                </tr>
              ))}
              {!isLoading && calls.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-600">No trade calls match your filters</td></tr>
              )}
              {calls.map(tc => {
                const transitions = ALLOWED_TRANSITIONS[tc.status] ?? []
                return (
                  <tr key={tc._id} className="hover:bg-bg-tertiary transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/trade-calls/${tc._id}`} className="group">
                        <div className="font-mono font-semibold text-white group-hover:text-indigo transition-colors">
                          {tc.instrument}
                        </div>
                        <div className="flex gap-1 mt-0.5">
                          <DirectionBadge d={tc.direction} />
                          <SegmentBadge s={tc.segment} />
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {tc.entry_price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 font-mono text-red">
                      {tc.current_sl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {tc.targets.map((t, i) => (
                          <span key={i} className={clsx(
                            'font-mono text-xs',
                            tc.targets_hit?.[i] ? 'text-green line-through opacity-60' : 'text-slate-300'
                          )}>
                            T{i + 1}: {t.toLocaleString('en-IN')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo"
                            style={{ width: `${Math.round(tc.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-slate-400">{Math.round(tc.confidence * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={tc.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                      {tc.createdAt ? format(new Date(tc.createdAt), 'dd MMM HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {transitions.length > 0 ? (
                        <select
                          disabled={busy === tc._id}
                          className="bg-bg-tertiary border border-border rounded-md px-2 py-1 text-xs text-slate-400 focus:outline-none focus:border-indigo/50 disabled:opacity-50"
                          value=""
                          onChange={e => e.target.value && changeStatus(tc._id, e.target.value as TradeCallStatus)}
                        >
                          <option value="">Move to…</option>
                          {transitions.map(s => (
                            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-600">Terminal</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.total > meta.limit && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-xs px-3 py-1.5 rounded-md bg-bg-tertiary border border-border text-slate-400 hover:text-white disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * meta.limit >= meta.total}
                className="text-xs px-3 py-1.5 rounded-md bg-bg-tertiary border border-border text-slate-400 hover:text-white disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
