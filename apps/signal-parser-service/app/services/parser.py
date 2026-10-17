from typing import Any

from app.core.config import Settings
from app.core.logging import get_logger
from app.models.trade_call import ParsedTradeCall
from app.services.llm_provider import LLMProvider
from app.services.classifier import RelevanceClassifier
from app.services.extractor import FieldExtractor

logger = get_logger(__name__)

# Fields whose absence still allows a complete trade call to be published.
# entry_price, stop_loss, and targets must ALL be present for a complete call.
_REQUIRED_FOR_COMPLETE = {"entry_price", "stop_loss", "targets"}


class ParseResult:
    """Structured return value from SignalParser.parse()."""

    __slots__ = ("trade_call", "confidence", "reason", "partial_fields", "is_complete")

    def __init__(
        self,
        trade_call: ParsedTradeCall | None,
        confidence: float,
        reason: str | None,
        partial_fields: dict[str, Any] | None = None,
        is_complete: bool = False,
    ) -> None:
        self.trade_call = trade_call
        self.confidence = confidence
        self.reason = reason
        self.partial_fields = partial_fields or {}
        self.is_complete = is_complete


class SignalParser:
    """
    Orchestrates classification → extraction → routing for a raw trade signal.

    Routing tiers:
      1. Not a signal  → discard (return reason="not_a_trade_signal", no review)
      2. Low confidence → review queue with partial_fields
      3. Partial parse  → review queue with whatever was extracted
      4. Complete       → publish to trade_call.created stream
    """

    def __init__(self, settings: Settings, provider: LLMProvider) -> None:
        self.classifier = RelevanceClassifier(provider)
        self.extractor = FieldExtractor(provider)
        self.threshold = settings.confidence_threshold
        self.model_version = settings.active_model_name

    async def parse(
        self,
        raw_text: str,
        raw_message_id: str,
        source_channel: str,
    ) -> ParseResult:
        """
        Parse a raw trade signal message end-to-end.

        Returns a ParseResult:
          - result.trade_call is set and result.is_complete=True  → publish
          - result.trade_call is set and result.is_complete=False → review with partial data
          - result.trade_call is None                             → discard (not a signal)
        """
        logger.info(
            "parse_start",
            raw_message_id=raw_message_id,
            source_channel=source_channel,
            model=self.model_version,
        )

        is_signal, confidence = await self.classifier.classify(raw_text)

        if not is_signal:
            logger.info(
                "parse_rejected_not_signal",
                raw_message_id=raw_message_id,
                confidence=confidence,
            )
            return ParseResult(None, confidence, "not_a_trade_signal")

        trade_call = await self.extractor.extract(raw_text)

        if trade_call is None:
            logger.warning("parse_extraction_failed", raw_message_id=raw_message_id)
            return ParseResult(
                None, confidence, "extraction_failed",
                partial_fields={"raw_text_snippet": raw_text[:200]},
            )

        trade_call.confidence = confidence
        missing = trade_call.missing_fields  # populated by extractor

        # Tier 1: low confidence — send to review even if all fields present
        if confidence < self.threshold:
            logger.info(
                "parse_low_confidence",
                raw_message_id=raw_message_id,
                confidence=confidence,
                threshold=self.threshold,
                missing=missing,
            )
            return ParseResult(
                trade_call, confidence,
                reason=f"low_confidence:{confidence:.2f}",
                partial_fields=trade_call.to_partial_dict(),
                is_complete=False,
            )

        # Tier 2: partial — has instrument + direction but missing key price fields
        if missing:
            reason = f"missing_fields:{','.join(missing)}"
            logger.warning(
                "parse_partial",
                raw_message_id=raw_message_id,
                missing=missing,
                instrument=trade_call.instrument,
            )
            return ParseResult(
                trade_call, confidence,
                reason=reason,
                partial_fields=trade_call.to_partial_dict(),
                is_complete=False,
            )

        # Tier 3: complete
        logger.info(
            "parse_success",
            raw_message_id=raw_message_id,
            instrument=trade_call.instrument,
            direction=trade_call.direction,
            confidence=confidence,
        )
        return ParseResult(trade_call, confidence, None, is_complete=True)
