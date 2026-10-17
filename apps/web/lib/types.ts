export enum Segment { EQUITY = 'EQUITY', COMMODITY = 'COMMODITY', F_AND_O = 'F_AND_O', FOREX = 'FOREX' }
export enum Direction { BUY = 'BUY', SELL = 'SELL' }

export enum TradeCallStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PARTIALLY_CLOSED = 'PARTIALLY_CLOSED',
  COMPLETED_ALL_TARGETS = 'COMPLETED_ALL_TARGETS',
  CLOSED_SL = 'CLOSED_SL',
  CLOSED_SL_BREAKEVEN = 'CLOSED_SL_BREAKEVEN',
  CLOSED_SL_AFTER_TP = 'CLOSED_SL_AFTER_TP',
  EXPIRED = 'EXPIRED',
  MANUALLY_CLOSED = 'MANUALLY_CLOSED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  REJECTED = 'REJECTED',
}

export enum ReviewStatus { PENDING = 'PENDING', PROMOTED = 'PROMOTED', REJECTED = 'REJECTED' }

export interface TradeCall {
  _id: string
  raw_message_id: string
  channel_id: string
  influencer_id: string
  instrument: string
  segment: Segment
  direction: Direction
  entry_price: number
  initial_sl: number
  current_sl: number
  targets: number[]
  target_split: number[]
  targets_hit: boolean[]
  trailing_sl: boolean
  risk_pct: number | null
  confidence: number
  model_version: string
  status: TradeCallStatus
  review_note: string | null
  createdAt: string
  activated_at: string | null
  closed_at: string | null
}

export interface ReviewItem {
  _id: string
  raw_message_id: string
  raw_text: string
  source_channel: string
  reason: string
  confidence: number
  partial_fields: Partial<TradeCall>
  status: ReviewStatus
  reviewed_by: string | null
  reviewed_at: string | null
  createdAt: string
}

export interface Stats {
  total: number
  byStatus: Record<string, number>
  bySegment: Record<string, number>
}

export interface ParseResult {
  success: boolean
  needs_review: boolean
  reason: string | null
  confidence: number
  data: {
    instrument: string
    segment: Segment
    direction: Direction
    entry_price: number | null
    stop_loss: number | null
    targets: number[]
    trailing_sl: boolean
    missing_fields: string[]
    confidence: number
  } | null
}

export const TERMINAL_STATUSES = new Set([
  TradeCallStatus.COMPLETED_ALL_TARGETS,
  TradeCallStatus.CLOSED_SL,
  TradeCallStatus.CLOSED_SL_BREAKEVEN,
  TradeCallStatus.CLOSED_SL_AFTER_TP,
  TradeCallStatus.EXPIRED,
  TradeCallStatus.MANUALLY_CLOSED,
  TradeCallStatus.REJECTED,
  TradeCallStatus.NEEDS_REVIEW,
])

export const ALLOWED_TRANSITIONS: Record<TradeCallStatus, TradeCallStatus[]> = {
  [TradeCallStatus.PENDING]: [TradeCallStatus.ACTIVE, TradeCallStatus.NEEDS_REVIEW, TradeCallStatus.REJECTED],
  [TradeCallStatus.ACTIVE]: [TradeCallStatus.PARTIALLY_CLOSED, TradeCallStatus.CLOSED_SL, TradeCallStatus.CLOSED_SL_BREAKEVEN, TradeCallStatus.EXPIRED, TradeCallStatus.MANUALLY_CLOSED],
  [TradeCallStatus.PARTIALLY_CLOSED]: [TradeCallStatus.PARTIALLY_CLOSED, TradeCallStatus.COMPLETED_ALL_TARGETS, TradeCallStatus.CLOSED_SL_AFTER_TP, TradeCallStatus.MANUALLY_CLOSED],
  [TradeCallStatus.COMPLETED_ALL_TARGETS]: [],
  [TradeCallStatus.CLOSED_SL]: [],
  [TradeCallStatus.CLOSED_SL_BREAKEVEN]: [],
  [TradeCallStatus.CLOSED_SL_AFTER_TP]: [],
  [TradeCallStatus.EXPIRED]: [],
  [TradeCallStatus.MANUALLY_CLOSED]: [],
  [TradeCallStatus.NEEDS_REVIEW]: [],
  [TradeCallStatus.REJECTED]: [],
}
