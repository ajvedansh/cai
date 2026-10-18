'use client'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import StatCard from '@/components/StatCard'
import { DirectionBadge, SegmentBadge, StatusBadge } from '@/components/Badge'
import type { TradeCall, ReviewItem } from '@/lib/types'
import { format } from 'date-fns'
import Link from 'next/link'
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates'

export default function Dashboard() {
  // SSE push — updates arrive instantly; 60 s polling is just a safety net
  useRealtimeUpdates()

  const { data: statsRes } = useSWR('/api/stats', fetcher, { refreshInterval: 60000 })
  const { data: callsRes } = useSWR('/api/trade-calls?limit=8&page=1', fetcher, { refreshInterval: 60000 })
  const { data: reviewRes } = useSWR('/api/review?status=PENDING', fetcher, { refreshInterval: 60000 })

  const stats = statsRes?.data ?? { total: 0, byStatus: {}, bySegment: {} }
  const calls: TradeCall[] = callsRes?.data ?? []
  const reviews: ReviewItem[] = reviewRes?.data ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {format(new Date(), 'EEEE, d MMMM yyyy')} · Indian Markets
          </p>
        </div>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-lg px-3 py-2">
          <span className="status-dot live" />
          <span className="text-xs text-green font-medium">Services Online</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Signals" value={stats.total} icon="∑" color="indigo" />
        <StatCard label="Active" value={stats.byStatus?.ACTIVE ?? 0} icon="↗" color="blue" sub="Live positions" />
        <StatCard label="Pending Review" value={reviews.length} icon="⊞" color="amber" sub="Needs attention" />
        <StatCard label="Closed SL" value={stats.byStatus?.CLOSED_SL ?? 0} icon="⊗" color="red" sub="Stop-loss hit" />
      </div>

      {/* Segment breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(stats.bySegment ?? {}).map(([seg, count]) => (
          <StatCard key={seg} label={seg} value={count as number} color="default" />
        ))}
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Trade Calls */}
        <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-white">Recent Trade Calls</h2>
            <Link href="/trade-calls" className="text-xs text-indigo hover:text-indigo/80">View all →</Link>
          </div>
          <div className="divide-y divide-border">
            {calls.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-600 text-sm">No trade calls yet</div>
            )}
            {calls.map(tc => (
              <Link key={tc._id} href={`/trade-calls/${tc._id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-bg-tertiary transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">{tc.instrument}</span>
                    <DirectionBadge d={tc.direction} />
                    <SegmentBadge s={tc.segment} />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-mono">
                    Entry: {tc.entry_price?.toLocaleString('en-IN')} · SL: {tc.current_sl?.toLocaleString('en-IN')}
                  </div>
                </div>
                <StatusBadge status={tc.status} />
              </Link>
            ))}
          </div>
        </div>

        {/* Review Queue */}
        <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-white">Review Queue</h2>
            <Link href="/review" className="text-xs text-indigo hover:text-indigo/80">Review all →</Link>
          </div>
          <div className="divide-y divide-border">
            {reviews.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-600 text-sm">Queue is empty</div>
            )}
            {reviews.slice(0, 6).map(item => (
              <Link key={item._id} href="/review"
                className="block px-4 py-3 hover:bg-bg-tertiary transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-400 font-mono leading-relaxed line-clamp-2 flex-1">
                    {item.raw_text}
                  </p>
                  <span className="shrink-0 badge badge-pending text-[10px]">
                    {Math.round(item.confidence * 100)}%
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-slate-600">{item.reason}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Status distribution */}
      {Object.keys(stats.byStatus ?? {}).length > 0 && (
        <div className="bg-bg-secondary border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-white mb-4">Status Distribution</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 bg-bg-tertiary rounded-lg px-3 py-2">
                <StatusBadge status={status as any} />
                <span className="font-mono text-sm text-slate-300 font-semibold">{count as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
