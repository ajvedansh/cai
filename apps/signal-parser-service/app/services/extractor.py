import json

from app.core.logging import get_logger
from app.models.trade_call import ParsedTradeCall, Segment, Direction
from app.services.llm_provider import LLMProvider

logger = get_logger(__name__)

EXTRACTION_SYSTEM_PROMPT = """\
You are a financial trade signal parser for Indian markets (NSE/BSE/MCX/FOREX).
Extract trade information and respond ONLY with valid JSON — no markdown, no explanation.

Output schema (use null for any field that cannot be determined):
{
  "instrument": "string | null",
  "segment": "EQUITY | COMMODITY | F_AND_O | FOREX | null",
  "direction": "BUY | SELL | null",
  "entry_price": number | null,
  "stop_loss": number | null,
  "targets": [number],
  "target_split": [number],
  "trailing_sl": boolean,
  "risk_pct": number | null
}

=== INSTRUMENT ===
The stock ticker, index, commodity, or currency pair. Usually in ALL CAPS.
- Strip exchange suffixes: "RELIANCE NSE" → "RELIANCE", "INFY BSE" → "INFY"
- For options, keep the full name: "BANKNIFTY 49000 CE", "NIFTY 24500 PE"
- Common commodities: GOLD, SILVER, CRUDE OIL, CRUDEOIL, COPPER, ZINC, ALUMINIUM, NATURAL GAS, NICKEL

=== SEGMENT ===
- EQUITY: stocks on NSE/BSE, index (NIFTY/BANKNIFTY without strike/CE/PE), mentions of equity/cash/share/stock
- COMMODITY: MCX mentions, or GOLD/SILVER/CRUDE/CRUDEOIL/COPPER/ZINC/ALUMINIUM/NICKEL/LEAD
- F_AND_O: CE/PE/call/put/futures/FnO/F&O in the message, or a strike price in the instrument name
- FOREX: USDINR/EURINR/currency/forex/FX

=== DIRECTION ===
- BUY: buy / long / bullish / accumulate / call buy / go long / entry buy / above (for breakout buys)
- SELL: sell / short / bearish / put buy / go short / entry sell / shorting

=== ENTRY PRICE ===
Synonyms: @, at, CMP, LTP, entry, price, buy at, sell at, cmp:, near, around, level
- A number appearing directly after the direction keyword (BUY/SELL/LONG/SHORT) with no other label IS the entry price
  e.g. "BUY 24500 SL 24300 TGT 24700" → entry_price=24500
  e.g. "SHORT 48500 SL 48800 T1 48200" → entry_price=48500
- Price range (e.g. 1600-1620): use the LOWER value for BUY, HIGHER for SELL
- "above 2800" for a BUY → entry_price = 2800
- "below 100" for a SELL → entry_price = 100
- "CMP" or "at market" or "market price" WITHOUT a following number → entry_price = null
  (CMP alone means "whatever the current price is" — you do not know that number, so return null)
- "CMP 2850" or "LTP 1600" WITH a following number → entry_price = that number
- Return null if genuinely absent — NEVER fabricate or guess a price

=== STOP LOSS ===
Synonyms: SL, S/L, sl:, Stop Loss, Stoploss, Stop, Risk at, Risk level, STOP:
- "below X" in a BUY signal → stop_loss = X
- "above X" in a SELL signal → stop_loss = X
- Return null if not mentioned

=== TARGETS ===
Synonyms: TP / TP1 / TP2 / TP3, T1 / T2 / T3, TGT / Tgt1, Target / Targets, Exit, Book at,
          Take profit, Profit, R1 / R2 (resistance), numbers after the SL on the same line
- Comma-separated or slash-separated or space-separated values all count
- Maximum 5 targets; trim if more
- Return [] if no targets are mentioned

=== TARGET SPLIT ===
- If the message states a split (e.g. "50% at T1, 50% at T2"), use those values normalised to sum=100
- Otherwise return [] and the system will fill in even splits

=== TRAILING SL ===
true if message contains: trail / trailing / dynamic SL / move SL / trail stop / adjust SL / TSL
false otherwise

=== MULTI-PART MESSAGE HANDLING ===
Messages may arrive in two parts joined with a separator:
  [QUOTE]: <original message text>
  [REPLY]: <follow-up text with additional details>
Merge both parts: [REPLY] fields override [QUOTE] fields for the same attribute.
Example:
  [QUOTE]: BUY RELIANCE @ 2850. SL 2780.
  [REPLY]: Targets: 2920, 3000, 3100
  → instrument=RELIANCE, direction=BUY, entry_price=2850, stop_loss=2780, targets=[2920,3000,3100]

=== PRE-PROCESSING ===
Before parsing, mentally strip these noise prefixes:
- "Forwarded message:", "Fwd:", "FWD:", ">> Forwarded <<", any "📌", "🔁", "📢" channel decorators
- "BREAKING:", "ALERT:", "SIGNAL:", "CALL:", "TRADE ALERT:" prefixes
These are delivery metadata, not part of the trade signal itself.

=== COMMON REAL-WORLD FORMATS (handle all of these) ===
"BUY INFY 1600 SL 1520 TGT 1680 1760"         — no @ sign
"RELIANCE CMP 2850, stop 2780, tgt 2920/2960"  — CMP with number, slash-separated targets
"Buy Infosys at 1600. Stoploss below 1520. Book profits at 1680, 1760, 1840. Equity."
"BANKNIFTY 49000 CE BUY 380 sl 420 t1 310 t2 260 trailing"
"GOLD MCX JULY BUY near 73200, risk 72800, exit 73600 and 74200"
"Short NIFTY FUTURES @ 24500 Stop: 24700 T1: 24200 T2: 24000"
"CRUDE OIL SELL 8500 above 8600 targets 8300 8100"  — 'above 8600' is SL for SELL
"entry RELIANCE 2850-2870 SL 2780 TP 2950"    — range entry, use 2850
"Aaj RELIANCE mein buy karo 2850 pe, SL 2780, target 2950 aur 3050" — Hinglish: "pe" = at price, "aur" = and
"🔥 NIFTY BUY 24500 🎯 24700 24900 🛑 24300"   — emojis as decorators, ignore them
"TCS BUY 3.5k SL 3.4k TGT 3.7k"              — k-notation: 3.5k = 3500

=== IMPORTANT ===
- Return null for any field you cannot determine — never fabricate values
- Prices for Indian stocks: 1 – 200000 range (reject obvious typos)
- If the message is clearly NOT a trade signal (news, jokes, general chat), set all fields to null and targets to []
"""


_FORWARDED_PREFIXES = (
    "forwarded message:", "fwd:", ">> forwarded <<",
    "breaking:", "alert:", "signal:", "trade alert:", "call:",
)

def _strip_noise(text: str) -> str:
    """Strip forwarded-message and channel-alert prefixes that confuse extraction."""
    import re
    # Remove leading emoji decorators (📌 🔁 📢 🔔 ⚡ 💥 🚨)
    text = re.sub(r"^[\U0001F4CC\U0001F501\U0001F4E2\U0001F514⚡\U0001F4A5\U0001F6A8\s]+", "", text.strip())
    # Strip known forwarded/alert prefixes (case-insensitive)
    lower = text.lower()
    for prefix in _FORWARDED_PREFIXES:
        if lower.startswith(prefix):
            text = text[len(prefix):].strip()
            break
    return text


def _strip_fences(raw: str) -> str:
    """Remove markdown code fences that some models wrap JSON in."""
    if "```" in raw:
        lines = raw.splitlines()
        return "\n".join(
            line for line in lines if not line.strip().startswith("```")
        )
    return raw


def _safe_float(value: object) -> float | None:
    """Convert to float, returning None for None/falsy/non-numeric."""
    if value is None:
        return None
    try:
        f = float(value)  # type: ignore[arg-type]
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


class FieldExtractor:
    """Extracts structured trade fields from raw signal text using an LLM."""

    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    async def extract(self, raw_text: str) -> ParsedTradeCall | None:
        """
        Extract a ParsedTradeCall from raw text.

        Returns:
            ParsedTradeCall — may have missing_fields populated (partial parse).
            None — LLM call failed or JSON completely unparseable.
        """
        clean_text = _strip_noise(raw_text)
        raw = await self._provider.complete(
            system=EXTRACTION_SYSTEM_PROMPT,
            user=clean_text,
            max_tokens=768,
        )
        if raw is None:
            return None

        try:
            data = json.loads(_strip_fences(raw).strip())
        except json.JSONDecodeError as exc:
            # Last-resort: find the first {...} block in the response
            import re
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group())
                except json.JSONDecodeError:
                    logger.warning("extractor_json_parse_error", error=str(exc), raw=raw[:300])
                    return None
            else:
                logger.warning("extractor_json_parse_error", error=str(exc), raw=raw[:300])
                return None

        try:
            instrument = (data.get("instrument") or "").strip()
            segment_raw = data.get("segment") or "EQUITY"
            direction_raw = data.get("direction") or "BUY"

            # Reject if core identity fields are missing
            if not instrument:
                logger.warning("extractor_no_instrument", data=str(data)[:200])
                return None
            try:
                segment = Segment(segment_raw)
            except ValueError:
                segment = Segment.EQUITY
            try:
                direction = Direction(direction_raw)
            except ValueError:
                direction = Direction.BUY

            entry_price = _safe_float(data.get("entry_price"))
            stop_loss = _safe_float(data.get("stop_loss"))

            # Direction sanity check: for BUY sl < entry; for SELL sl > entry.
            # If violated and both are set, flip direction — the model parsed prices
            # correctly but labelled the direction wrong (common with SHORT keyword).
            if entry_price and stop_loss:
                if direction == Direction.BUY and stop_loss > entry_price:
                    direction = Direction.SELL
                    logger.info("direction_corrected", reason="sl_above_entry_implies_sell")
                elif direction == Direction.SELL and stop_loss < entry_price:
                    direction = Direction.BUY
                    logger.info("direction_corrected", reason="sl_below_entry_implies_buy")

            raw_targets = data.get("targets") or []
            targets = [f for f in (_safe_float(t) for t in raw_targets) if f is not None]

            raw_split = data.get("target_split") or []
            target_split = [int(x) for x in raw_split if x is not None] if raw_split else []

            trade_call = ParsedTradeCall(
                instrument=instrument,
                segment=segment,
                direction=direction,
                entry_price=entry_price,
                stop_loss=stop_loss,
                targets=targets,
                target_split=target_split,
                trailing_sl=bool(data.get("trailing_sl", False)),
                risk_pct=_safe_float(data.get("risk_pct")),
                confidence=0.0,
            )
            trade_call.missing_fields = trade_call.compute_missing_fields()

            logger.info(
                "extraction_complete",
                instrument=trade_call.instrument,
                direction=trade_call.direction,
                entry_price=trade_call.entry_price,
                stop_loss=trade_call.stop_loss,
                targets=trade_call.targets,
                missing=trade_call.missing_fields,
            )
            return trade_call

        except (ValueError, KeyError) as exc:
            logger.warning("extractor_validation_error", error=str(exc))
            return None
        except Exception as exc:
            logger.error("extractor_unexpected_error", error=str(exc))
            return None
