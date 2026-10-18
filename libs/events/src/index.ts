import type { Segment, Direction } from '@cai/types';

// ── Stream Names ──────────────────────────────────────────────────────────────

export const STREAMS = {
  MESSAGE_RECEIVED: 'cai:message.received',
  TRADE_CALL_CREATED: 'cai:trade_call.created',
  MESSAGE_NEEDS_REVIEW: 'cai:message.needs_review',
  TRADE_CALL_ACTIVATED: 'cai:trade_call.activated',
} as const;

// ── Consumer Groups ───────────────────────────────────────────────────────────

export const CONSUMER_GROUPS = {
  SIGNAL_PARSER: 'signal-parser-group',
  TRADE_CALL_SVC: 'trade-call-svc-group',
} as const;

// ── Event Payloads ────────────────────────────────────────────────────────────

export interface BaseEvent {
  event_id: string;
  event_type: string;
  produced_by: string;
  produced_at: string; // ISO8601
}

export interface MessageReceivedEvent extends BaseEvent {
  event_type: 'message.received';
  payload: {
    raw_message_id: string;
    source_platform: string;
    source_channel: string;
    sender_id: string;
    raw_text: string;
    received_at: string;
  };
}

export interface TradeCallCreatedEvent extends BaseEvent {
  event_type: 'trade_call.created';
  payload: {
    raw_message_id: string;
    source_channel: string;
    instrument: string;
    segment: Segment;
    direction: Direction;
    entry_price: number;
    stop_loss: number;
    targets: number[];
    target_split: number[];
    trailing_sl: boolean;
    risk_pct: number | null;
    confidence: number;
    model_version: string;
    // Full structured JSON the LLM produced — stored verbatim on the TradeCall document
    parsed_data: Record<string, unknown>;
  };
}

export interface MessageNeedsReviewEvent extends BaseEvent {
  event_type: 'message.needs_review';
  payload: {
    raw_message_id: string;
    source_channel: string;
    raw_text: string;
    confidence: number;
    reason: string;
    partial_fields: Record<string, unknown>;
  };
}

export interface TradeCallActivatedEvent extends BaseEvent {
  event_type: 'trade_call.activated';
  payload: {
    trade_call_id: string;
    instrument: string;
    segment: Segment;
    direction: Direction;
    entry_price: number;
    stop_loss: number;
    targets: number[];
    trailing_sl: boolean;
  };
}

export type CaiEvent =
  | MessageReceivedEvent
  | TradeCallCreatedEvent
  | MessageNeedsReviewEvent
  | TradeCallActivatedEvent;
