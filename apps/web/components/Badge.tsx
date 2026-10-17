import clsx from 'clsx'
import { Direction, TradeCallStatus, Segment, ReviewStatus } from '@/lib/types'

export function DirectionBadge({ d }: { d: Direction }) {
  return (
    <span className={clsx('badge', d === Direction.BUY ? 'badge-buy' : 'badge-sell')}>
      {d === Direction.BUY ? '▲' : '▼'} {d}
    </span>
  )
}

export function SegmentBadge({ s }: { s: Segment }) {
  const cls: Record<Segment, string> = {
    [Segment.EQUITY]: 'badge-equity',
    [Segment.F_AND_O]: 'badge-fno',
    [Segment.COMMODITY]: 'badge-commodity',
    [Segment.FOREX]: 'badge-forex',
  }
  const labels: Record<Segment, string> = {
    [Segment.EQUITY]: 'EQ', [Segment.F_AND_O]: 'F&O',
    [Segment.COMMODITY]: 'COM', [Segment.FOREX]: 'FX',
  }
  return <span className={clsx('badge', cls[s])}>{labels[s]}</span>
}

const STATUS_CLS: Record<string, string> = {
  PENDING: 'badge-pending',
  ACTIVE: 'badge-active',
  PARTIALLY_CLOSED: 'badge-active',
  COMPLETED_ALL_TARGETS: 'badge-buy',
  CLOSED_SL: 'badge-sell',
  CLOSED_SL_BREAKEVEN: 'badge-closed',
  CLOSED_SL_AFTER_TP: 'badge-closed',
  EXPIRED: 'badge-closed',
  MANUALLY_CLOSED: 'badge-closed',
  NEEDS_REVIEW: 'badge-pending',
  REJECTED: 'badge-sell',
  PROMOTED: 'badge-buy',
}

export function StatusBadge({ status }: { status: TradeCallStatus | ReviewStatus }) {
  return (
    <span className={clsx('badge', STATUS_CLS[status] ?? 'badge-closed')}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
