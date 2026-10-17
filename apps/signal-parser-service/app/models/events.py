from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime, timezone
import uuid


class BaseEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    produced_by: str = "signal-parser-service"
    produced_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class MessageReceivedPayload(BaseModel):
    raw_message_id: str
    source_platform: str
    source_channel: str
    sender_id: str
    raw_text: str
    received_at: str


class MessageReceivedEvent(BaseModel):
    event_id: str
    event_type: str
    produced_by: str
    produced_at: str
    payload: MessageReceivedPayload


class TradeCallCreatedPayload(BaseModel):
    raw_message_id: str
    source_channel: str
    instrument: str
    segment: str
    direction: str
    entry_price: Optional[float]
    stop_loss: Optional[float]
    targets: list[float]
    target_split: list[int]
    trailing_sl: bool
    risk_pct: Optional[float]
    confidence: float
    model_version: str


class TradeCallCreatedEvent(BaseEvent):
    event_type: str = "trade_call.created"
    payload: TradeCallCreatedPayload


class NeedsReviewPayload(BaseModel):
    raw_message_id: str
    source_channel: str
    raw_text: str
    confidence: float
    reason: str
    partial_fields: dict[str, Any]


class NeedsReviewEvent(BaseEvent):
    event_type: str = "message.needs_review"
    payload: NeedsReviewPayload
