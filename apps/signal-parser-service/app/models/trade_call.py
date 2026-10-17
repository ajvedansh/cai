from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Any
from enum import Enum


class Segment(str, Enum):
    EQUITY = "EQUITY"
    COMMODITY = "COMMODITY"
    F_AND_O = "F_AND_O"
    FOREX = "FOREX"


class Direction(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class ParsedTradeCall(BaseModel):
    instrument: str
    segment: Segment
    direction: Direction
    # Optional — real signals sometimes omit SL or targets
    entry_price: Optional[float] = None
    stop_loss: Optional[float] = None
    targets: list[float] = Field(default=[], max_length=5)
    target_split: list[int] = Field(default=[])
    trailing_sl: bool = False
    risk_pct: Optional[float] = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    # Fields populated when this is a partial parse (goes to review queue)
    missing_fields: list[str] = Field(default=[])

    @field_validator("targets")
    @classmethod
    def limit_targets(cls, v: list[float]) -> list[float]:
        return v[:5]

    @model_validator(mode="after")
    def normalise_target_split(self) -> "ParsedTradeCall":
        n = len(self.targets)
        if not self.targets:
            self.target_split = []
            return self
        # If caller supplied a matching split, normalise it to sum=100
        if len(self.target_split) == n and sum(self.target_split) > 0:
            total = sum(self.target_split)
            if total != 100:
                normalised = [round(x * 100 / total) for x in self.target_split]
                diff = 100 - sum(normalised)
                if diff != 0:
                    normalised[-1] += diff
                self.target_split = normalised
        else:
            # Generate default even split
            defaults = {1: [100], 2: [50, 50], 3: [33, 34, 33], 4: [25, 25, 25, 25]}
            self.target_split = defaults.get(n, [round(100 / n)] * n)
            # Fix rounding
            diff = 100 - sum(self.target_split)
            if diff != 0:
                self.target_split[-1] += diff
        return self

    def compute_missing_fields(self) -> list[str]:
        """Return field names that are required but absent in this record."""
        missing = []
        if not self.entry_price:
            missing.append("entry_price")
        if not self.stop_loss:
            missing.append("stop_loss")
        if not self.targets:
            missing.append("targets")
        return missing

    def to_partial_dict(self) -> dict[str, Any]:
        """Return extractable fields as a plain dict for the review payload."""
        return {
            "instrument": self.instrument,
            "segment": self.segment.value,
            "direction": self.direction.value,
            "entry_price": self.entry_price,
            "stop_loss": self.stop_loss,
            "targets": self.targets,
            "trailing_sl": self.trailing_sl,
            "missing_fields": self.missing_fields,
        }


class ParseRequest(BaseModel):
    raw_text: str = Field(min_length=5, max_length=4000)
    source_channel: str = "test-channel"
    raw_message_id: str = "test-id"


class ParseResponse(BaseModel):
    success: bool
    data: Optional[ParsedTradeCall] = None
    needs_review: bool = False
    reason: Optional[str] = None
    confidence: float = 0.0
    model_version: str
