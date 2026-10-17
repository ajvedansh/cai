# CAI — Implementation Guide

> Technical decisions, data flow, and extension points for engineers building on CAI.

---

## 1. Full Data Flow (Step by Step)

```
Step 1: Influencer posts in Telegram group
        "BUY INFY @ 1600. SL 1520. TP 1680/1760/1840 Equity."

Step 2: channel-connector-service receives webhook
        ├─ Validates Telegram secret header
        ├─ Parses webhook body via TelegramAdapter
        ├─ Computes SHA-256 dedup_hash = hash("TELEGRAM" + message_id)
        ├─ Checks Redis: SET NX with dedup_hash (60s TTL)
        │    → If key already exists: DROP (duplicate)
        ├─ Saves RawMessage to MongoDB:
        │    { message_id, source_platform: "TELEGRAM", source_channel, 
        │      sender_id, raw_text, status: "QUEUED", received_at }
        └─ Publishes to Redis Stream cai:message.received:
             { event_id, event_type, produced_by, produced_at, payload: { raw_message_id, ... } }

Step 3: signal-parser-service consumes from Redis Stream
        ├─ XREADGROUP GROUP signal-parser-group consumer-1 STREAMS cai:message.received >
        ├─ Parses event JSON → extracts raw_text, raw_message_id, source_channel
        ├─ Step 3a: RELEVANCE CLASSIFIER
        │    Calls Claude API:
        │    System: "Is this a trade signal? Return JSON {is_trade_signal, confidence, reason}"
        │    User:   "BUY INFY @ 1600. SL 1520..."
        │    → { is_trade_signal: true, confidence: 0.97 }
        │
        ├─ If confidence < 0.85:
        │    Publishes to cai:message.needs_review
        │    { reason: "low_confidence", confidence: 0.62, partial_fields: {} }
        │    ACKs message
        │    DONE
        │
        ├─ Step 3b: FIELD EXTRACTOR (only if confidence >= 0.85)
        │    Calls Claude API again:
        │    System: "Extract trade fields. Return strict JSON schema."
        │    User:   raw_text
        │    → { instrument: "INFY", segment: "EQUITY", direction: "BUY",
        │        entry_price: 1600, stop_loss: 1520, targets: [1680, 1760, 1840],
        │        target_split: [30, 30, 40], trailing_sl: false }
        │
        ├─ Step 3c: VALIDATION
        │    Checks: instrument present, entry_price > stop_loss for BUY,
        │             targets ascending for BUY, mandatory fields not null
        │    → PASS
        │
        ├─ Publishes to cai:trade_call.created:
        │    { event_type: "trade_call.created", payload: { raw_message_id, instrument, 
        │      segment, direction, entry_price, stop_loss, targets, ... confidence: 0.97 } }
        └─ ACKs message in Redis

Step 4: trade-call-service consumes from cai:trade_call.created
        ├─ XREADGROUP GROUP trade-call-svc-group consumer-1 STREAMS cai:trade_call.created >
        ├─ Checks: existing ACTIVE TradeCall for same instrument + channel_id within 24h?
        │    → No existing: CREATE new TradeCall
        │    → Yes existing: UPDATE entry_price, stop_loss, targets (update detection)
        ├─ Creates TradeCall in MongoDB (trade_call_db):
        │    { raw_message_id, instrument: "INFY", segment: "EQUITY", direction: "BUY",
        │      entry_price: 1600, initial_sl: 1520, current_sl: 1520,
        │      targets: [1680, 1760, 1840], target_split: [30, 30, 40],
        │      trailing_sl: false, confidence: 0.97, status: "ACTIVE" }
        ├─ Since confidence >= 0.85: status = ACTIVE immediately
        ├─ Publishes to cai:trade_call.activated (consumed by execution-engine in Phase 2)
        └─ ACKs message in Redis
```

---

## 2. Service Boundaries — What Each Service MUST NOT Do

### channel-connector-service
| ❌ Must NOT | ✅ Instead |
|---|---|
| Parse or interpret message content | Publish raw text as-is |
| Write to trade_call_db | Publish events only |
| Call broker APIs | — |
| Know what a TradeCall is | — |

### signal-parser-service
| ❌ Must NOT | ✅ Instead |
|---|---|
| Write to any database | Publish events to Redis |
| Manage TradeCall lifecycle | Emit trade_call.created event |
| Call broker APIs | — |
| Authenticate end-users | — |
| Retry if Claude API is down | Use error → needs_review |

### trade-call-service
| ❌ Must NOT | ✅ Instead |
|---|---|
| Parse raw text | Consume structured events only |
| Call Claude API | — |
| Call broker APIs | — |
| Calculate P&L | (analytics-service in Phase 2) |
| Send push notifications | (notification-service in Phase 2) |

---

## 3. MongoDB Collections

### channel_db (owned by channel-connector-service)

**raw_messages**
```
_id           ObjectId
message_id    String (platform message ID)
source_platform  "TELEGRAM" | "WHATSAPP"
source_channel   String
sender_id     String
raw_text      String
media_urls    [String]
received_at   Date
status        "QUEUED" | "PROCESSING" | "PARSED" | "NEEDS_REVIEW" | "REJECTED"
trade_call_id  ObjectId | null
dedup_hash    String (unique index)
createdAt     Date (auto)
updatedAt     Date (auto)
```

**Indexes:**
- `{ dedup_hash: 1 }` — unique (deduplication)
- `{ status: 1, received_at: -1 }` — listing by status
- `{ source_channel: 1, received_at: -1 }` — per-channel queries

**channel_registry**
```
_id           ObjectId
platform      String
channel_id    String
display_name  String
influencer_id String
segment_focus [String]
active        Boolean
added_at      Date
```

**Indexes:**
- `{ platform: 1, channel_id: 1 }` — unique (per-platform channel ID)

---

### trade_call_db (owned by trade-call-service)

**trade_calls**
```
_id             ObjectId
raw_message_id  String (unique)
channel_id      String
influencer_id   String
instrument      String
segment         "EQUITY" | "COMMODITY" | "F_AND_O" | "FOREX"
direction       "BUY" | "SELL"
entry_price     Number
initial_sl      Number
current_sl      Number  (updated by execution-engine events in Phase 2)
targets         [Number]
target_split    [Number]  (must sum to 100)
targets_hit     [Boolean]
trailing_sl     Boolean
risk_pct        Number | null
confidence      Number (0–1)
model_version   String
status          String (see state machine)
review_note     String | null
activated_at    Date | null
closed_at       Date | null
createdAt       Date
updatedAt       Date
```

**Indexes:**
- `{ raw_message_id: 1 }` — unique
- `{ status: 1, createdAt: -1 }` — listing
- `{ instrument: 1, channel_id: 1, createdAt: -1 }` — update detection query

**review_queue**
```
_id             ObjectId
raw_message_id  String
source_channel  String
raw_text        String
confidence      Number
reason          String
partial_fields  Object
status          "PENDING" | "PROMOTED" | "REJECTED"
reviewed_by     String | null
reviewed_at     Date | null
createdAt       Date
```

---

## 4. Redis Streams

### Stream: `cai:message.received`
- **Producer:** channel-connector-service
- **Consumer Group:** `signal-parser-group`
- **Consumers:** signal-parser-service
- **Retention:** Trimmed to last 10,000 entries (MAXLEN)

**Event shape:**
```json
{
  "event_id": "uuid-v4",
  "event_type": "message.received",
  "produced_by": "channel-connector-service",
  "produced_at": "2026-10-14T10:00:00Z",
  "payload": {
    "raw_message_id": "mongo-object-id",
    "source_platform": "TELEGRAM",
    "source_channel": "@StockMasterPro",
    "sender_id": "user-123",
    "raw_text": "BUY INFY @ 1600...",
    "received_at": "2026-10-14T10:00:00Z"
  }
}
```

### Stream: `cai:trade_call.created`
- **Producer:** signal-parser-service
- **Consumer Group:** `trade-call-svc-group`
- **Consumers:** trade-call-service

**Event shape:**
```json
{
  "event_id": "uuid-v4",
  "event_type": "trade_call.created",
  "produced_by": "signal-parser-service",
  "produced_at": "2026-10-14T10:00:01Z",
  "payload": {
    "raw_message_id": "mongo-object-id",
    "source_channel": "@StockMasterPro",
    "instrument": "INFY",
    "segment": "EQUITY",
    "direction": "BUY",
    "entry_price": 1600,
    "stop_loss": 1520,
    "targets": [1680, 1760, 1840],
    "target_split": [30, 30, 40],
    "trailing_sl": true,
    "risk_pct": 2,
    "confidence": 0.97,
    "model_version": "claude-3-5-haiku-20241022"
  }
}
```

### Stream: `cai:message.needs_review`
- **Producer:** signal-parser-service
- **Consumer Group:** `trade-call-svc-group`
- **Consumers:** trade-call-service

### Stream: `cai:trade_call.activated`
- **Producer:** trade-call-service
- **Consumer Group:** (Phase 2: execution-engine-group, notification-group)

---

## 5. TradeCall State Machine

```
                     ┌─────────────┐
                     │   PENDING   │ ← created when confidence < 0.85
                     └──────┬──────┘
            admin activates │
                            │
         ┌──────────────────┴──────────────────┐
         │ auto (confidence >= 0.85)           │ admin rejects
         ▼                                     ▼
    ┌─────────┐                          ┌──────────┐
    │  ACTIVE │                          │ REJECTED │
    └────┬────┘                          └──────────┘
         │
   ┌─────┼─────────────────────────────────────┐
   │     │                                     │
   ▼     ▼                                     ▼
PARTIALLY  CLOSED_SL          EXPIRED   MANUALLY_CLOSED
CLOSED     (before any TP)
   │
   ├─ CLOSED_SL_BREAKEVEN     (SL at entry, hit after TP1)
   ├─ CLOSED_SL_AFTER_TP      (SL above entry, hit after TP1+)
   └─ COMPLETED_ALL_TARGETS   (all TPs hit)
```

**Valid transitions:**
```typescript
const TRANSITIONS: Record<TradeCallStatus, TradeCallStatus[]> = {
  PENDING:           ['ACTIVE', 'NEEDS_REVIEW', 'REJECTED'],
  ACTIVE:            ['PARTIALLY_CLOSED', 'CLOSED_SL', 'EXPIRED', 'MANUALLY_CLOSED'],
  PARTIALLY_CLOSED:  ['PARTIALLY_CLOSED', 'COMPLETED_ALL_TARGETS', 
                      'CLOSED_SL_BREAKEVEN', 'CLOSED_SL_AFTER_TP', 'MANUALLY_CLOSED'],
  // Terminal states — no transitions
  COMPLETED_ALL_TARGETS: [],
  CLOSED_SL:             [],
  CLOSED_SL_BREAKEVEN:   [],
  CLOSED_SL_AFTER_TP:    [],
  EXPIRED:               [],
  MANUALLY_CLOSED:       [],
  NEEDS_REVIEW:          ['ACTIVE', 'REJECTED'],
  REJECTED:              [],
};
```

---

## 6. Adding a New Channel (e.g. Discord)

1. Create `apps/channel-connector-service/src/adapters/discord/discord.adapter.ts`
   - Implement `parse(payload: unknown): IncomingMessage`
   - Implement `verifyWebhookSignature(body, signature, secret): boolean`

2. Add endpoint in `webhooks.controller.ts`:
   ```typescript
   @Post('discord')
   @Public()
   async discordWebhook(@Body() body: unknown, @Headers() headers: Record<string, string>) {
     // same pattern as Telegram/WhatsApp
   }
   ```

3. Add `channel_registry` entry via API with `platform: "DISCORD"`.

4. No other services change — the event schema is platform-agnostic.

---

## 7. Adding a New Market Segment (e.g. Crypto)

1. Add `CRYPTO = 'CRYPTO'` to the `Segment` enum in `libs/types/src/index.ts`.

2. Update the Signal Parser's `EXTRACTION_SYSTEM_PROMPT` in `extractor.py` to map:
   ```
   "crypto" / "BTC" / "ETH" → "CRYPTO"
   ```

3. Update the `FieldExtractor` response schema to include `"CRYPTO"` as a valid segment.

4. Update the Mongoose enum in `trade-call.schema.ts` and `channel.schema.ts`.

5. Add crypto instrument validation in `market-data-service` (Phase 2).

---

## 8. Claude API Usage — Parsing Architecture

The signal-parser-service makes **two separate Claude API calls** per message:

### Call 1 — Relevance Classifier
```
Model:  claude-3-5-haiku-20241022  (fast, cheap)
System: "Is this a financial trade signal? Return JSON {is_trade_signal, confidence, reason}"
Max tokens: 100
```
- Fast because the answer is always a tiny JSON object
- Haiku model is sufficient for binary classification
- Returns early if confidence < threshold (saves the second call cost)

### Call 2 — Field Extractor (only if Call 1 passes)
```
Model:  claude-3-5-haiku-20241022
System: "Extract trade fields. Return strict JSON matching schema."
Max tokens: 512
```
- Structured-output prompt with exact field names and types in the system prompt
- Claude's JSON output is parsed with `json.loads()`
- Any JSON parse error → message sent to needs_review queue

### Cost estimate (rough)
- ~50 tokens in + ~20 tokens out per classifier call ≈ $0.00003
- ~80 tokens in + ~100 tokens out per extractor call ≈ $0.00009
- Total per message: ~$0.00012 (< $0.01 for 80 messages)

---

## 9. Security Implementation

### API Key Authentication
Every protected endpoint checks the `x-api-key` header. In NestJS:
```typescript
// Guard checks: reflector.get(IS_PUBLIC_KEY, handler) → skip
// Otherwise: ctx.switchToHttp().getRequest().headers['x-api-key'] === config.apiKey
```

In Python FastAPI:
```python
api_key_header = APIKeyHeader(name="x-api-key")
async def verify_api_key(api_key: str = Depends(api_key_header)):
    if api_key != settings.api_key:
        raise HTTPException(status_code=401)
```

### Telegram Webhook Verification
Telegram sends an `X-Telegram-Bot-Api-Secret-Token` header. The connector verifies it matches the secret registered with Telegram's `setWebhook` call.

### WhatsApp Webhook Verification
Meta sends an `X-Hub-Signature-256` header with `sha256=HMAC(app_secret, raw_body)`. The connector computes the same HMAC and uses `crypto.timingSafeEqual` for comparison.

### Secrets Never Logged
Both NestJS services use a custom logging interceptor that redacts headers containing `authorization`, `x-api-key`, `token`, `secret`, `key` before logging.

### Rate Limiting
All NestJS services use `@nestjs/throttler`: 100 requests per 60 seconds per IP. Webhook endpoints are excluded (they come from platform servers with fixed IPs, not end users).

---

## 10. Error Handling Strategy

### Dead Message Policy
When a Redis Stream consumer fails to process a message after 3 retries:
1. The message is ACKed (to prevent infinite reprocessing)
2. A `message.dead_letter` event is logged with the error details
3. The original `raw_message_id` is flagged with `status: "REJECTED"` in MongoDB

### MongoDB Write Failures
- Unique index violation on `dedup_hash` (channel-connector): silently drop, log info
- Unique index violation on `raw_message_id` (trade-call): update the existing record
- Connection failure: retry with exponential backoff (1s, 2s, 4s, max 30s)

### Claude API Failures
- `anthropic.RateLimitError`: retry after 2 seconds, max 3 times
- `anthropic.APIError`: route message to `needs_review` with reason `"ai_error"`
- `json.JSONDecodeError` on Claude response: route to `needs_review` with reason `"parse_error"`

---

## 11. Extending to Phase 2

When you add the **execution-engine-service** and **notification-service**:

1. They consume `cai:trade_call.activated` — already being published by trade-call-service.
2. They publish `execution.*` events — trade-call-service subscribes and updates `current_sl`, `targets_hit`, `status`.
3. No changes needed to the 3 Phase 1 services except:
   - trade-call-service: add consumer for `execution.*` events
   - Add new consumer group registrations

The Phase 1 services are completely forward-compatible.

---

## 12. Local Redis Stream Inspection

Useful commands for debugging the pipeline:

```bash
# Connect to Redis in the Docker container
docker-compose exec redis redis-cli -a cai_redis_local

# See all streams
KEYS cai:*

# See last 5 messages in ingestion stream
XREVRANGE cai:message.received + - COUNT 5

# See consumer group info
XINFO GROUPS cai:message.received

# See pending messages (processed but not ACKed)
XPENDING cai:message.received signal-parser-group - + 10

# Manually ACK a stuck message (emergency)
XACK cai:message.received signal-parser-group <message-id>

# See trade_call.created stream
XREVRANGE cai:trade_call.created + - COUNT 5
```

---

*CAI Implementation Guide · v1.0.0 · October 2026*
