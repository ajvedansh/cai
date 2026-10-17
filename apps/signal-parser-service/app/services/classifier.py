import json

from app.core.logging import get_logger
from app.services.llm_provider import LLMProvider

logger = get_logger(__name__)

CLASSIFICATION_SYSTEM_PROMPT = """\
You are a financial trade signal classifier for Indian markets (NSE/BSE/MCX/FOREX).
Respond ONLY with a valid JSON object — no markdown, no explanation:
{"is_trade_signal": boolean, "confidence": float_0_to_1, "reason": string}

A message IS a trade signal if it contains AT LEAST ONE of:
- A clear BUY/SELL/LONG/SHORT/BUY CALL/BUY PUT directive on a named instrument
- A direction word: buy, sell, long, short, bullish, bearish, entry buy, entry sell
- An entry price (with or without @, CMP, LTP, at, near)
- A stop loss (SL, S/L, stop, stoploss, risk)
- Targets / take-profit levels (TGT, TP, T1, target, exit, book)
- Hinglish / Hindi trading phrases: "buy karo", "sell karo", "kharido", "becho", "lelo", "le lo",
  "mein buy", "mein sell", "pe buy", "pe sell", "pe lena", "target rakho", "SL rakho",
  "target hai", "stop rakho" — these are equivalent to their English counterparts

A message is NOT a trade signal if it is:
- General market news or commentary with no actionable trade
- A question or discussion without a trade directive
- A result/update on a past trade with no new entry

confidence: how clearly it reads as a new actionable trade signal (0.0–1.0)
- 0.9+: explicit BUY/SELL with price, SL, and targets
- 0.8–0.9: clear direction and price but missing one field
- 0.6–0.8: implied trade signal (SHORT/LONG without full details)
- below 0.6: likely not a trade signal
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
            On error returns (False, 0.0).
        """
        raw = await self._provider.complete(
            system=CLASSIFICATION_SYSTEM_PROMPT,
            user=raw_text,
            max_tokens=256,
        )
        if raw is None:
            return False, 0.0

        try:
            # Strip markdown code fences if the model wrapped the JSON
            if raw.startswith("```"):
                raw = "\n".join(
                    line for line in raw.splitlines() if not line.startswith("```")
                )
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
            return False, 0.0
