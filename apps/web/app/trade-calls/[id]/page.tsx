'use client'
import useSWR from 'swr'
import { fetcher, updateTradeCallStatus, activateTradeCall } from '@/lib/api'
import { DirectionBadge, SegmentBadge, StatusBadge } from '@/components/Badge'
import { TradeCallStatus, ALLOWED_TRANSITIONS, TERMINAL_STATUSES } from '@/lib/types'
import { format } from 'date-fns'
import Link from 'next/link'
import { useState } from 'react'
import clsx from 'clsx'

export default function TradeCallDetail({ params }: { params: { id: string } }) {
  const { data, mutate, isLoading } = useSWR(`/api/trade-calls/${params.id}`, fetcher, { refreshInterval: 10000 })
  const tc = data?.data
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function changeStatus(status: TradeCallStatus) {
    setBusy(true); setError('')
    const res = await updateTradeCallStatus(tc._id, status)
    setBusy(false)
    if (!res.success) setError('Invalid state transition')
    else mutate()
  }

  async function activate() {
    setBusy(true); setError('')
    const res = await activateTradeCall(tc._id)
    setBusy(false)
    if (!res.success) setError('Activation failed')
    else mutate()
  }

  if (isLoading) return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-24 rounded-xl" />
      ))}
    </div>
  )

  if (!tc) return (
    <div className="text-center py-20 text-slate-600">
      <div className="text-4xl mb-2">¬</div>
      Trade call not found
      <div className="mt-4"><Link href="/trade-calls" className="text-indigo text-sm">← Back</Link></div>
    </div>
  )

  const transitions = ALLOWED_TRANSITIONS[tc.status as TradeCallStatus] ?? []
  const pct = (val: number, base: number) =>
    base ? ((val - base) / base * 100).toFixed(2) : '0.00'

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/trade-calls" className="hover:text-slate-300">Trade Calls</Link>
        <span>/</span>
        <span className="text-slate-300 font-mono">{tc.instrument}</span>
      </div>

      {/* Hero */}
      <div className="bg-bg-secondary border border-border rounded-xl p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-mono text-2xl font-bold text-white">{tc.instrument}</h1>
              <DirectionBadge d={tc.direction} />
              <SegmentBadge s={tc.segment} />
            </div>
            <div className="mt-2 text-xs text-slate-500 font-mono">
              ID: {tc._id} · Source: {tc.channel_id}
            </div>
          </div>
          <StatusBadge status={tc.status} />
        </div>

        {/* Prices */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-bg-tertiary rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Entry Price</div>
            <div className="font-mono text-lg font-semibold text-white">{tc.entry_price?.toLocaleString('en-IN')}</div>
          </div>
          <div className="bg-bg-tertiary rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Stop Loss</div>
            <div className="font-mono text-lg font-semibold text-red">{tc.current_sl?.toLocaleString('en-IN')}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              {pct(tc.current_sl, tc.entry_price)}% from entry
            </div>
          </div>
          <div className="bg-bg-tertiary rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Confidence</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-bg-primary rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-indigo" style={{ width: `${Math.round(tc.confidence * 100)}%` }} />
              </div>
              <span className="font-mono text-sm text-indigo">{Math.round(tc.confidence * 100)}%</span>
            </div>
          </div>
          <div className="bg-bg-tertiary rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Risk %</div>
            <div className="font-mono text-lg font-semibold text-slate-300">{tc.risk_pct ?? '—'}</div>
          </div>
        </div>
      </div>

      {/* Targets */}
      <div className="bg-bg-secondary border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Targets</h2>
        <div className="space-y-3">
          {tc.targets.map((t: number, i: number) => (
            <div key={i} className="flex items-center gap-4">
              <div className="text-xs text-slate-500 w-4">T{i + 1}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className={clsx(
                    'font-mono text-sm font-medium',
                    tc.targets_hit?.[i] ? 'text-green' : 'text-slate-300'
                  )}>
                    {t.toLocaleString('en-IN')}
                    {tc.targets_hit?.[i] && <span className="ml-2 text-[10px]">✓ HIT</span>}
                  </span>
                  <span className="text-xs text-slate-500">
                    +{pct(t, tc.entry_price)}% · {tc.target_split?.[i] ?? '—'}%
                  </span>
                </div>
                <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full', tc.targets_hit?.[i] ? 'bg-green' : 'bg-bg-hover')}
                    style={{ width: tc.targets_hit?.[i] ? '100%' : '0%' }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meta */}
      <div className="bg-bg-secondary border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Details</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {[
            ['Model', tc.model_version],
            ['Trailing SL', tc.trailing_sl ? 'Yes' : 'No'],
            ['Created', tc.createdAt ? format(new Date(tc.createdAt), 'dd MMM yyyy HH:mm') : '—'],
            ['Activated', tc.activated_at ? format(new Date(tc.activated_at), 'dd MMM yyyy HH:mm') : '—'],
            ['Closed', tc.closed_at ? format(new Date(tc.closed_at), 'dd MMM yyyy HH:mm') : '—'],
            ['Review note', tc.review_note ?? '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{k}</div>
              <div className="text-slate-300 font-mono text-xs mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {!TERMINAL_STATUSES.has(tc.status) && (
        <div className="bg-bg-secondary border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Actions</h2>
          {error && <div className="mb-3 bg-red/10 border border-red/30 rounded-lg px-3 py-2 text-sm text-red">{error}</div>}
          <div className="flex flex-wrap gap-2">
            {tc.status === TradeCallStatus.PENDING && (
              <button
                onClick={activate}
                disabled={busy}
                className="px-4 py-2 bg-blue/20 border border-blue/30 text-blue text-sm font-medium rounded-lg hover:bg-blue/30 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Activating…' : '▶ Activate'}
              </button>
            )}
            {transitions.filter(s => s !== TradeCallStatus.ACTIVE).map(s => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={busy}
                className="px-4 py-2 bg-bg-tertiary border border-border text-slate-400 text-sm rounded-lg hover:text-white hover:border-slate-500 disabled:opacity-50 transition-colors"
              >
                {busy ? '…' : `→ ${s.replace(/_/g, ' ')}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
