import json

from app.core.logging import get_logger
from app.services.llm_provider import LLMProvider

logger = get_logger(__name__)

CLASSIFICATION_SYSTEM_PROMPT = """\
You are a financial trade signal classifier for Indian stock, options and commodity markets (NSE/BSE/MCX).

Your task: decide if the message is an actionable trade signal.

IMPORTANT: Respond with ONLY a raw JSON object. No markdown. No code fences. No explanation. Start your response with { and end with }.

Format: {"is_trade_signal": true, "confidence": 0.95, "reason": "brief reason"}

A message IS a trade signal if it contains ANY of:
- Instrument name (NIFTY, BANKNIFTY, RELIANCE, any stock/index) + direction (BUY/SELL/LONG/SHORT)
- Options notation like "49000 CE", "48000 PE" with a direction or price
- Entry price (with or without @, CMP, LTP, at, near)
- Stop loss keywords: SL, S/L, stop, stoploss
- Target keywords: TGT, TP, T1, T2, T3, target, exit
- Trailing SL mention
- Hinglish: "buy karo", "sell karo", "le lo", "mein buy", "pe buy"

A message is NOT a trade signal if it is:
- Pure market news or commentary with no trade instruction
- A question or greeting with no trade details
- A result/profit report with no new entry signal

EXAMPLES of valid signals (all should return is_trade_signal: true):
- "NIFTY BUY 24500 SL 24200 TGT 24800"
- "BANKNIFTY 49000 CE BUY @ 380 SL 420 T1 310 T2 260 trailing"
- "RELIANCE short 2850 sl 2900 target 2750"
- "buy INFY at CMP SL 1580 TGT 1650"

confidence scale:
- 0.9+: has instrument, direction, price, SL, and targets
- 0.8-0.9: has instrument + direction + price, missing one field
- 0.6-0.8: partial signal, implied direction
- below 0.6: not clearly a trade signal
"""

CLASSIFICATION_FALLBACK_PROMPT = """\
Does the following message contain a stock/options trading signal with a buy or sell instruction?
Reply with only: YES or NO
"""


class RelevanceClassifier:
    """Determines whether a raw message text is a trade signal."""

    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    async def classify(self, raw_text: str) -> tuple[bool, float]:
        """
        Classify raw text as a trade signal or not.

        Returns:
            (is_trade_signal, confidence) tuple.
            On error falls back to a YES/NO prompt before returning (False, 0.0).
        """
        raw = await self._provider.complete(
            system=CLASSIFICATION_SYSTEM_PROMPT,
            user=raw_text,
            max_tokens=128,
        )
        if raw is None:
            return False, 0.0

        try:
            # Strip markdown code fences if the model wrapped the JSON
            if "```" in raw:
                raw = "\n".join(
                    line for line in raw.splitlines() if not line.strip().startswith("```")
                )
            # Extract first JSON object in case model adds extra commentary
            start, end = raw.find("{"), raw.rfind("}") + 1
            if start != -1 and end > start:
                raw = raw[start:end]
            result = json.loads(raw.strip())
            is_trade_signal: bool = bool(result.get("is_trade_signal", False))
            confidence: float = float(result.get("confidence", 0.0))
            reason: str = result.get("reason", "")
            logger.info(
                "classification_complete",
                is_trade_signal=is_trade_signal,
                confidence=confidence,
                reason=reason,
            )
            return is_trade_signal, confidence
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            logger.warning("classifier_parse_error", error=str(exc), raw=raw[:200])
            # Fallback: ask a simpler YES/NO question
            return await self._fallback_classify(raw_text)

    async def _fallback_classify(self, raw_text: str) -> tuple[bool, float]:
        """Simple YES/NO fallback when JSON parsing fails."""
        raw = await self._provider.complete(
            system=CLASSIFICATION_FALLBACK_PROMPT,
            user=raw_text,
            max_tokens=10,
        )
        if raw is None:
            return False, 0.0
        answer = raw.strip().upper()
        is_signal = answer.startswith("YES")
        confidence = 0.75 if is_signal else 0.0
        logger.info("classifier_fallback_used", answer=answer, is_signal=is_signal)
        return is_signal, confidence
