// ── Enums ────────────────────────────────────────────────────────────────────

export enum SourcePlatform {
  TELEGRAM = 'TELEGRAM',
  WHATSAPP = 'WHATSAPP',
}

export enum RawMessageStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  PARSED = 'PARSED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  REJECTED = 'REJECTED',
}

export enum Segment {
  EQUITY = 'EQUITY',
  COMMODITY = 'COMMODITY',
  F_AND_O = 'F_AND_O',
  FOREX = 'FOREX',
}

export enum Direction {
  BUY = 'BUY',
  SELL = 'SELL',
}

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

export enum ReviewStatus {
  PENDING = 'PENDING',
  PROMOTED = 'PROMOTED',
  REJECTED = 'REJECTED',
}

// ── Core Domain Types ─────────────────────────────────────────────────────────

export interface RawMessage {
  _id: string;
  message_id: string;
  source_platform: SourcePlatform;
  source_channel: string;
  sender_id: string;
  raw_text: string;
  media_urls: string[];
  received_at: string;
  status: RawMessageStatus;
  trade_call_id: string | null;
  dedup_hash: string;
}

export interface Channel {
  _id: string;
  platform: SourcePlatform;
  channel_id: string;
  display_name: string;
  influencer_id: string;
  segment_focus: Segment[];
  active: boolean;
  added_at: string;
}

export interface TradeCall {
  _id: string;
  raw_message_id: string;
  channel_id: string;
  influencer_id: string;
  instrument: string;
  segment: Segment;
  direction: Direction;
  entry_price: number;
  initial_sl: number;
  current_sl: number;
  targets: number[];
  target_split: number[];
  targets_hit: boolean[];
  trailing_sl: boolean;
  risk_pct: number | null;
  confidence: number;
  model_version: string;
  status: TradeCallStatus;
  review_note: string | null;
  created_at: string;
  activated_at: string | null;
  closed_at: string | null;
}

export interface ReviewItem {
  _id: string;
  raw_message_id: string;
  raw_text: string;
  source_channel: string;
  reason: string;
  confidence: number;
  partial_fields: Partial<TradeCall>;
  status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// ── API Response Wrappers ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface PaginatedQuery {
  page?: number;
  limit?: number;
}
