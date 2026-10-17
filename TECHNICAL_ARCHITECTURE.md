# CAI — Technical Architecture Document

> **Version:** 1.0 · **Date:** October 2026 · **Author:** Ajai Mishra  
> **Status:** Draft · **Companion:** [BRD.md](./BRD.md)

---

## Table of Contents

1. [Monorepo Decision](#1-monorepo-decision)
2. [System Overview](#2-system-overview)
3. [Service Map](#3-service-map)
4. [Service Specifications](#4-service-specifications)
   - 4.1 [API Gateway](#41-api-gateway)
   - 4.2 [User Service](#42-user-service)
   - 4.3 [Channel Connector Service](#43-channel-connector-service)
   - 4.4 [Signal Parser Service](#44-signal-parser-service)
   - 4.5 [Trade Call Service](#45-trade-call-service)
   - 4.6 [Market Data Service](#46-market-data-service)
   - 4.7 [Execution Engine Service](#47-execution-engine-service)
   - 4.8 [Notification Service](#48-notification-service)
   - 4.9 [Analytics Service](#49-analytics-service)
5. [Shared Libraries](#5-shared-libraries)
6. [Inter-Service Communication](#6-inter-service-communication)
7. [Event Catalogue](#7-event-catalogue)
8. [Data Ownership Map](#8-data-ownership-map)
9. [Monorepo Folder Structure](#9-monorepo-folder-structure)
10. [Infrastructure & Deployment](#10-infrastructure--deployment)
11. [Technology Decisions](#11-technology-decisions)
12. [Anti-Patterns to Avoid](#12-anti-patterns-to-avoid)

---

## 1. Monorepo Decision

### Should you use a monorepo for microservices?

**Yes — strongly recommended for this project at this stage.**

Here is an honest breakdown:

### Why monorepo wins here

| Concern | Monorepo Answer |
|---|---|
| **Shared types** | `TradeCall`, `RawMessage`, `ExecutionEvent` schemas are shared across 5+ services. In a polyrepo you'd publish npm packages and fight version drift. In a monorepo you import from `@cai/types` and a schema change is a single commit. |
| **Atomic refactors** | When you rename a field in `TradeCall`, one PR touches every service that uses it. In polyrepo this is 5 separate PRs with coordination overhead. |
| **Team size** | You are a small team (likely 2–4 engineers to start). Polyrepo overhead — separate CI, separate package publishing, separate PR queues — hurts small teams the most. |
| **Contract testing** | Shared event definitions in `@cai/events` mean producer and consumer are always in sync without a separate contract-testing harness. |
| **Code visibility** | An engineer debugging the full signal pipeline can read Channel Connector → Parser → Trade Call Service in one editor window. |

### When to switch to polyrepo

Move a service to its own repo only when:
- It is owned by a completely separate team on a separate release cycle, **and**
- Its deployment cadence causes more problems than the shared-code convenience solves.

For CAI, that threshold is not reached in Phase 1 or 2.

### Recommended tooling

```
pnpm workspaces  (package manager)
Nx               (build orchestration, affected-only CI, dependency graph)
Docker Compose   (local multi-service dev)
```

`Nx` is the right choice over Turborepo here because it understands `NestJS` applications natively, runs only affected services in CI, and has first-class support for generating libraries with correct dependency constraints.

---

## 2. System Overview

CAI has a single, left-to-right data flow. Every architectural decision below is in service of making that flow fast, resilient, and independently scalable at each stage.

```
External World
  │
  ├─ WhatsApp / Telegram / other channels
  │         │
  │         ▼
  │   ┌─────────────────────┐
  │   │  Channel Connector  │  ← Only service that touches platform APIs
  │   └────────┬────────────┘
  │            │ publishes: message.received
  │            ▼
  │   ┌─────────────────────┐
  │   │  Signal Parser      │  ← Only service that runs NLP/AI
  │   └────────┬────────────┘
  │            │ publishes: trade_call.created | message.needs_review
  │            ▼
  │   ┌─────────────────────┐
  │   │  Trade Call Service │  ← Single source of truth for TradeCall state
  │   └────────┬────────────┘
  │            │ publishes: trade_call.activated
  │            ▼
  │   ┌─────────────────────┐        ┌───────────────────┐
  │   │  Execution Engine   │◄───────│  Market Data Svc  │  ← Broker tick feed
  │   └────────┬────────────┘        └───────────────────┘
  │            │ publishes: execution.* events
  │            ▼
  │   ┌─────────────────────┐
  │   │  Analytics Service  │  ← Reads execution events, computes P&L & scores
  │   └─────────────────────┘
  │
  │   ┌─────────────────────┐
  │   │  Notification Svc   │  ← Reads trade_call + execution events, alerts users
  │   └─────────────────────┘
  │
  │   ┌─────────────────────┐
  │   │  User Service       │  ← Auth, profiles, broker key vault
  │   └─────────────────────┘
  │
  ▼
  API Gateway  ←─  Web / Mobile clients
```

---

## 3. Service Map

| # | Service | Epic | Primary Role | DB | Protocol |
|---|---|---|---|---|---|
| 1 | **api-gateway** | — | Route, auth-check, rate-limit | None | HTTP/REST |
| 2 | **user-service** | — | Auth, profiles, broker key vault | PostgreSQL | HTTP + gRPC |
| 3 | **channel-connector-service** | EPIC-1 | Ingest raw messages from platforms | MongoDB | Webhook → Queue |
| 4 | **signal-parser-service** | EPIC-2 | NLP/AI extraction of trade fields | None (stateless) | Queue consumer |
| 5 | **trade-call-service** | EPIC-2 | TradeCall lifecycle state machine | MongoDB | HTTP + Queue |
| 6 | **market-data-service** | EPIC-3 | Real-time price tick distribution | Redis (ticks) | WebSocket → Queue |
| 7 | **execution-engine-service** | EPIC-3 | Virtual order simulation + trailing SL | MongoDB | Queue consumer |
| 8 | **notification-service** | — | Push alerts + approval handling | MongoDB | Queue consumer + HTTP |
| 9 | **analytics-service** | — | P&L, win-rate, channel scoring | MongoDB | Queue consumer + HTTP |

---

## 4. Service Specifications

Each specification follows a fixed contract:
- **Owns** — the collections/tables it is the sole writer of
- **Reads** — data it reads from other services (via API or event)
- **Publishes** — events it emits to the message broker
- **Consumes** — events it subscribes to
- **Does NOT** — explicit hard boundary, things it must never do

---

### 4.1 API Gateway

**Runtime:** Node.js (Express or Fastify)  
**Port:** 443 (public)

#### Responsibility
The single entry point for all HTTP traffic from web and mobile clients. It authenticates the JWT, enforces rate limits, and proxies the request to the correct downstream service. It contains **zero business logic**.

#### Does
- Verify JWT signature on every inbound request (public key from User Service)
- Route `/api/v1/users/**` → user-service
- Route `/api/v1/trade-calls/**` → trade-call-service
- Route `/api/v1/analytics/**` → analytics-service
- Route `/api/v1/admin/**` → trade-call-service or user-service
- Rate limit per user (100 req/min) and per IP (500 req/min)
- Strip sensitive headers before proxying
- Add `X-Request-ID` for distributed tracing

#### Does NOT
- Call broker APIs directly
- Read MongoDB
- Perform any business validation (that belongs in the target service)
- Cache responses (leave caching decisions to downstream services)

#### Environment Variables
```
JWT_PUBLIC_KEY=
USER_SERVICE_URL=
TRADE_CALL_SERVICE_URL=
ANALYTICS_SERVICE_URL=
NOTIFICATION_SERVICE_URL=
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

---

### 4.2 User Service

**Runtime:** Node.js / NestJS  
**DB:** PostgreSQL (relational — users, subscriptions, broker configs have strong referential integrity needs)  
**Port:** 3001 (internal)

#### Responsibility
Single source of truth for identity. Manages customer, influencer, and admin accounts. Stores broker API credentials in an encrypted vault. Issues and validates JWTs.

#### Owns
```
users                (id, email, role, hashed_password, kyc_status, created_at)
broker_configs       (id, user_id, broker_name, encrypted_api_key, encrypted_secret, default_qty, risk_limits)
subscriptions        (id, user_id, plan, valid_from, valid_to, status)
influencers          (id, user_id, display_name, sebi_registration, verified, channel_ids[])
```

#### Publishes
```
user.registered      { user_id, role, email }
user.suspended       { user_id, reason }
subscription.started { user_id, plan, valid_to }
subscription.expired { user_id }
```

#### API Surface (internal, called by other services)
```
GET  /internal/users/:id                → UserProfile
GET  /internal/users/:id/broker-config  → BrokerConfig (decrypted key only in secure internal network)
POST /internal/auth/verify-token        → { user_id, role } | 401
```

#### Does NOT
- Parse trade signals
- Call broker APIs directly
- Store trade call or execution data
- Emit price ticks

#### Security Notes
- Broker API keys encrypted with AES-256-GCM; encryption key stored in AWS Secrets Manager / Vault
- Keys are **never** logged, even at DEBUG level
- Separate read-replica for analytics queries; primary is write-only for the service itself

---

### 4.3 Channel Connector Service

**Runtime:** Node.js / NestJS  
**DB:** MongoDB (`raw_messages` collection)  
**Port:** 3002 (internal) + webhook endpoint (public, behind API gateway)  
**Queue:** Publishes to `message-ingestion` topic (Redis Streams or RabbitMQ)

#### Responsibility
The only service in the system that holds credentials for WhatsApp Business API and Telegram Bot API. Receives messages from those platforms (via webhook or long-poll), stores every message **exactly once**, and publishes a lightweight event so the parser can process it asynchronously.

#### Owns
```mongodb
// Collection: raw_messages
{
  _id:              ObjectId,
  message_id:       String,        // platform's own message ID
  source_platform:  "TELEGRAM" | "WHATSAPP",
  source_channel:   String,        // channel/group ID
  sender_id:        String,
  raw_text:         String,
  media_urls:       [String],
  received_at:      ISODate,
  status:           "QUEUED" | "PROCESSING" | "PARSED" | "NEEDS_REVIEW" | "REJECTED",
  trade_call_id:    ObjectId | null,
  dedup_hash:       String         // SHA-256 of (message_id + source_platform)
}

// Collection: channel_registry (admin-managed)
{
  _id:              ObjectId,
  platform:         String,
  channel_id:       String,
  display_name:     String,
  influencer_id:    ObjectId,      // ref → user-service
  segment_focus:    [String],
  active:           Boolean,
  added_at:         ISODate
}
```

#### Publishes
```
message.received  {
  raw_message_id: string,
  source_platform: string,
  source_channel: string,
  sender_id: string,
  raw_text: string,
  received_at: ISO8601
}
```

#### Consumes
None. This is the head of the pipeline.

#### Key Implementation Details

**Deduplication** — Before writing to MongoDB, check `dedup_hash` index. If the hash exists, increment a counter and drop. This handles Telegram retransmissions and WhatsApp webhook retries.

**Telegram adapter** — Uses `node-telegram-bot-api` in webhook mode (not long-poll) for production reliability. Registers the webhook URL on startup. Filters to only channels listed in `channel_registry`.

**WhatsApp adapter** — Connects via Meta's Cloud API webhook. Verifies the `X-Hub-Signature-256` header on every incoming request. Only processes `messages` type events; ignores read receipts, status updates.

**Fault tolerance** — If the queue publish fails, the raw_message remains in `QUEUED` status. A cron job (inside this service) re-queues messages stuck in `QUEUED` for > 60 seconds. This ensures at-least-once delivery to the parser.

#### Does NOT
- Interpret or parse message content
- Know what a TradeCall is
- Store parsed data
- Talk to brokers
- Authenticate end-users (no JWT check — inbound is from platform APIs, not users)

#### Anti-Pattern Warning
> **Never** add parsing logic here "just for a quick check." Once business logic leaks into the connector, you lose the ability to re-parse old messages with an updated model, and the connector becomes fragile.

---

### 4.4 Signal Parser Service

**Runtime:** Node.js / NestJS (or Python if a heavy ML model is needed; see note)  
**DB:** None — stateless  
**Queue:** Consumes `message.received`; publishes `trade_call.created` and `message.needs_review`

#### Responsibility
The AI brain of the system. Consumes raw message events, decides whether each message is an actionable trade signal, and extracts structured fields. The result is either a validated trade call payload (published to `trade_call.created`) or a review flag (published to `message.needs_review`). It **does not persist anything itself**.

#### Language Note
If you use Claude API (Anthropic) for extraction, this service stays in Node.js and makes a structured-output API call. If you train/fine-tune a local model, use Python with FastAPI instead and expose an internal HTTP endpoint that the Node.js consumer calls. The queue consumer wrapper stays in Node.js either way.

#### Consumes
```
message.received → process each message
```

#### Publishes
```
trade_call.created  {
  raw_message_id: string,
  instrument:     string,
  segment:        "EQUITY" | "COMMODITY" | "F_AND_O" | "FOREX",
  direction:      "BUY" | "SELL",
  entry_price:    number,
  stop_loss:      number,
  targets:        number[],          // max 3
  target_split:   number[],          // pct per target, default [34,33,33]
  trailing_sl:    boolean,
  risk_pct:       number | null,
  confidence:     number,            // 0.0 – 1.0
  model_version:  string             // e.g. "claude-3.5-sonnet-20241022"
}

message.needs_review  {
  raw_message_id: string,
  confidence:     number,
  reason:         string,            // "missing_sl" | "missing_tp" | "low_confidence" | ...
  partial_fields: object             // whatever was extracted before confidence fell
}
```

#### Parsing Pipeline (internal steps)

```
1. RELEVANCE CLASSIFIER
   Input:  raw_text
   Output: is_trade_signal (bool), confidence (float)
   Rule:   confidence < 0.60 → publish message.needs_review immediately

2. FIELD EXTRACTOR
   Input:  raw_text (only runs if step 1 passes)
   Output: { instrument, segment, direction, entry_price, stop_loss, targets[] }
   Uses:   Claude API with structured-output schema OR regex fallback for well-known formats

3. VALIDATION
   - All mandatory fields present? (instrument, entry_price, stop_loss, targets[0])
   - entry_price > stop_loss for BUY, entry_price < stop_loss for SELL?
   - targets ascending for BUY, descending for SELL?
   - instrument resolvable in NSE/BSE/MCX master? (lookup call to market-data-service)
   Fail → publish message.needs_review with reason

4. SEGMENT NORMALISATION
   "equity" | "cash" | "NSE" → "EQUITY"
   "commodity" | "mcx"       → "COMMODITY"
   "F&O" | "futures" | "PE"  → "F_AND_O"
   "forex" | "FX"            → "FOREX"

5. EMIT
   Publish trade_call.created if all validations pass
   Otherwise publish message.needs_review
```

#### Prompt Design (Claude API path)
```typescript
const EXTRACTION_SCHEMA = {
  type: "object",
  required: ["instrument","segment","direction","entry_price","stop_loss","targets"],
  properties: {
    instrument:   { type: "string" },
    segment:      { type: "string", enum: ["EQUITY","COMMODITY","F_AND_O","FOREX"] },
    direction:    { type: "string", enum: ["BUY","SELL"] },
    entry_price:  { type: "number" },
    stop_loss:    { type: "number" },
    targets:      { type: "array", items: { type: "number" }, maxItems: 3 },
    risk_pct:     { type: ["number","null"] },
    trailing_sl:  { type: "boolean" }
  }
};
```

#### Does NOT
- Write to any database directly
- Manage TradeCall status or lifecycle
- Know about users or subscriptions
- Call broker APIs
- Execute or simulate trades

---

### 4.5 Trade Call Service

**Runtime:** Node.js / NestJS  
**DB:** MongoDB (`trade_calls` collection)  
**Port:** 3004 (internal)

#### Responsibility
The lifecycle state machine for every TradeCall. Owns the canonical `trade_calls` document. Receives parsed signal events and creates TradeCall records. Receives human review decisions from admin UI. Provides the HTTP API that admin portal and analytics query.

#### Owns
```mongodb
// Collection: trade_calls
{
  _id:              ObjectId,
  raw_message_id:   ObjectId,
  channel_id:       String,
  influencer_id:    ObjectId,
  instrument:       String,
  segment:          Enum,
  direction:        "BUY" | "SELL",
  entry_price:      Decimal128,
  initial_sl:       Decimal128,
  current_sl:       Decimal128,       // updated by execution-engine via event
  targets:          [Decimal128],
  target_split:     [Number],
  targets_hit:      [Boolean],        // [false, false, false] initially
  trailing_sl:      Boolean,
  risk_pct:         Number | null,
  confidence:       Number,
  model_version:    String,
  status:           Enum,             // see state machine below
  review_note:      String | null,    // admin's note on manual review
  created_at:       ISODate,
  activated_at:     ISODate | null,
  closed_at:        ISODate | null
}

// Collection: review_queue
{
  _id:              ObjectId,
  raw_message_id:   ObjectId,
  reason:           String,
  confidence:       Number,
  partial_fields:   Object,
  status:           "PENDING" | "PROMOTED" | "REJECTED",
  reviewed_by:      ObjectId | null,
  reviewed_at:      ISODate | null
}
```

#### TradeCall State Machine

```
                    ┌──────────┐
    trade_call      │ PENDING  │  ← created from parser event
    .created  ──►   │          │
                    └────┬─────┘
                         │  auto-activate (confidence ≥ 0.85)
                         │  OR admin-promotes from review_queue
                         ▼
                    ┌──────────┐
                    │  ACTIVE  │  ← execution engine starts watching this
                    └────┬─────┘
              ┌──────────┴──────────┐
              │                     │
     tp1/tp2  ▼                     ▼  price hits SL
         ┌─────────┐          ┌──────────────┐
         │PARTIALLY│          │  CLOSED_SL   │
         │  CLOSED │          └──────────────┘
         └────┬────┘
              │ all targets hit
              ▼
         ┌────────────────────┐
         │ COMPLETED_ALL_TGT  │
         └────────────────────┘
```

Valid statuses: `PENDING` | `ACTIVE` | `PARTIALLY_CLOSED` | `COMPLETED_ALL_TARGETS` | `CLOSED_SL` | `CLOSED_SL_BREAKEVEN` | `CLOSED_SL_AFTER_TP1` | `EXPIRED` | `MANUALLY_CLOSED` | `NEEDS_REVIEW` | `REJECTED`

#### Consumes
```
trade_call.created       → create TradeCall document with status PENDING / ACTIVE
message.needs_review     → add to review_queue collection
execution.tp_hit         → update targets_hit[], may change status to PARTIALLY_CLOSED
execution.sl_triggered   → update status to CLOSED_SL*
execution.tsl_advanced   → update current_sl field
```

#### Publishes
```
trade_call.activated   { trade_call_id, instrument, segment, entry_price, stop_loss, targets, trailing_sl }
trade_call.updated     { trade_call_id, change_type, new_values }
trade_call.closed      { trade_call_id, close_reason, final_pnl_pct }
```

#### HTTP API (internal + admin portal)
```
GET  /trade-calls                  → paginated list (filters: status, segment, channel, date)
GET  /trade-calls/:id              → full TradeCall document
PATCH /trade-calls/:id/status      → admin manual status override
GET  /review-queue                 → list of NEEDS_REVIEW items
POST /review-queue/:id/promote     → admin promotes with filled fields → emits trade_call.activated
POST /review-queue/:id/reject      → admin rejects → status = REJECTED
GET  /channel-registry             → list configured channels
POST /channel-registry             → add channel (admin)
PATCH /channel-registry/:id/toggle → activate/deactivate channel
```

#### Update Detection Logic
When a `trade_call.created` event arrives for instrument X from channel Y, check:
- Is there an ACTIVE TradeCall for instrument X from channel Y created within the last 24 hours?
- If yes, and the new entry/SL/targets differ: update the existing TradeCall (emit `trade_call.updated`)
- If no: create a new TradeCall

#### Does NOT
- Parse messages (never read raw_text)
- Execute or simulate trades
- Call broker APIs
- Calculate P&L (that belongs in analytics-service)
- Authenticate users (rely on API gateway JWT)

---

### 4.6 Market Data Service

**Runtime:** Node.js / NestJS  
**DB:** Redis (latest tick per instrument; TTL 30 s)  
**Port:** 3005 (internal)  
**Queue:** Publishes `tick.price_update` events

#### Responsibility
The only service that holds broker WebSocket connections for real-time market ticks. Normalises tick data across different broker formats into a single internal schema, and fans it out to the execution engine via the message broker. Also provides an HTTP endpoint so other services (e.g. parser for instrument validation, execution engine for initial price check) can query the latest price of an instrument.

#### Does NOT own any persistent storage. Redis is used as a live cache only.

#### Supported Broker Adapters (Phase 1)
- `ZerodhaAdapter` — Kite Connect WebSocket
- `UpstoxAdapter` — Upstox Market Data WebSocket
- `AngelOneAdapter` — Angel One SmartAPI WebSocket

Each adapter implements:
```typescript
interface IBrokerTickAdapter {
  connect(instruments: string[]): Promise<void>;
  subscribe(instrument: string): void;
  unsubscribe(instrument: string): void;
  onTick(handler: (tick: NormalisedTick) => void): void;
  disconnect(): void;
}
```

#### Normalised Tick Schema
```typescript
interface NormalisedTick {
  instrument:     string;      // e.g. "INFY", "GOLD", "NIFTY21500PE"
  segment:        Segment;
  last_price:     number;
  bid:            number;
  ask:            number;
  volume:         number;
  tick_at:        string;      // ISO8601
  broker_source:  string;
}
```

#### Publishes
```
tick.price_update  {
  instrument: string,
  last_price: number,
  bid:        number,
  ask:        number,
  tick_at:    ISO8601
}
```
> **High-frequency concern:** Ticks arrive hundreds of times per second per instrument. Do NOT put every raw tick on the queue. Instead, publish a tick event **only when price changes exceed a configured minimum step** (e.g. 0.01% move) OR when an active TradeCall has SL/TP levels within a configurable proximity threshold.

#### HTTP API (internal)
```
GET  /price/:instrument          → { last_price, bid, ask, tick_at }
GET  /instruments?q=INFY         → instrument search + validation (NSE/BSE/MCX master)
POST /subscriptions              → { instrument_ids: string[] } → subscribe to ticks
DELETE /subscriptions/:instrument → unsubscribe
```

#### Instrument Master Data
Maintains an in-memory copy of the NSE/BSE/MCX instrument list, refreshed daily at 08:00 IST. Used by the Signal Parser to validate extracted instrument names. Stored in Redis with a 24-hour TTL.

#### F&O Expiry Calendar
Maintains a map of `{ underlying → next_expiry_date }` for F&O instruments. Used by the parser to resolve "SEP expiry" into an exact date. Source: NSE's official FO_securities.csv, refreshed weekly.

#### Does NOT
- Manage trade calls
- Simulate or execute orders
- Store historical tick data (that is the broker's job or a data vendor's)
- Authenticate users

---

### 4.7 Execution Engine Service

**Runtime:** Node.js / NestJS  
**DB:** MongoDB (`virtual_positions`, `execution_events`)  
**Queue:** Consumes `trade_call.activated`, `tick.price_update`; publishes `execution.*` events

#### Responsibility
The most stateful and performance-critical service. Maintains a running map of active virtual positions, evaluates every price tick against each position's SL and TP levels, and drives the trailing-SL state machine. Emits events for every significant outcome (entry, partial exit, SL trigger).

#### Owns
```mongodb
// Collection: virtual_positions
{
  _id:              ObjectId,
  trade_call_id:    ObjectId,
  instrument:       String,
  segment:          Enum,
  direction:        "BUY" | "SELL",
  entry_price:      Decimal128,
  entry_tick_at:    ISODate,
  virtual_qty:      Number,          // derived from risk_pct or fixed default
  initial_sl:       Decimal128,
  current_sl:       Decimal128,      // updated in-place
  targets:          [Decimal128],
  target_split:     [Number],
  targets_hit:      [Boolean],
  remaining_pct:    Number,          // 100 initially, decrements at each TP
  status:           "OPEN" | "PARTIALLY_CLOSED" | "CLOSED",
  trailing_sl:      Boolean,
  opened_at:        ISODate,
  closed_at:        ISODate | null
}

// Collection: execution_events  (append-only ledger)
{
  _id:              ObjectId,
  trade_call_id:    ObjectId,
  position_id:      ObjectId,
  event_type:       Enum,            // see Event Catalogue below
  tick_price:       Decimal128,
  qty_pct:          Number,          // % of original position
  pnl_delta:        Decimal128,
  new_sl:           Decimal128 | null,
  recorded_at:      ISODate
}
```

#### Consumes
```
trade_call.activated  → create virtual_position, begin tick subscription
tick.price_update     → evaluate all open positions for this instrument
```

#### Trailing SL State Machine

```
Position entry: current_sl = initial_sl

On each tick where last_price >= TP[i] AND targets_hit[i] == false:
  1. Close qty_pct[i] of position at last_price
  2. Record execution_event: TP[i]_HIT
  3. Set targets_hit[i] = true
  4. If trailing_sl == true:
       new_sl = (i == 0) ? entry_price : targets[i-1]
       Update current_sl = new_sl
       Record execution_event: TSL_ADVANCE
  5. If all targets hit: close position, record COMPLETED

On each tick where last_price <= current_sl (BUY) OR last_price >= current_sl (SELL):
  1. Close remaining_pct of position at last_price
  2. Determine close_reason:
       - No targets hit → CLOSED_SL_LOSS
       - 1+ targets hit, sl == entry_price → CLOSED_SL_BREAKEVEN
       - 1+ targets hit, sl > entry_price → CLOSED_SL_AFTER_TP[i]
  3. Record execution_event: SL_TRIGGERED
  4. Update virtual_position status = CLOSED
```

#### In-Memory Position Map
For tick-latency reasons, active positions are held in a `Map<instrument, Position[]>` in memory. On startup, the service hydrates this map from MongoDB. Writes to MongoDB are done **after** the in-memory state is updated, so the p99 SL evaluation latency is a hash-map lookup, not a DB round-trip.

#### Publishes
```
execution.entry_simulated   { trade_call_id, position_id, entry_price, entry_tick_at }
execution.tp_hit            { trade_call_id, tp_index, tick_price, qty_pct, pnl_delta }
execution.tsl_advanced      { trade_call_id, old_sl, new_sl }
execution.sl_triggered      { trade_call_id, close_reason, tick_price, remaining_pct, pnl_delta }
execution.position_closed   { trade_call_id, total_pnl_pct, close_reason }
```

#### Does NOT
- Send real orders to any broker
- Authenticate users
- Manage TradeCall metadata (status updates flow through events to trade-call-service)
- Store raw messages

#### Critical Constraint
This service must have a separate set of broker credentials from any future live-execution service. Environment variable `EXECUTION_MODE=SANDBOX` must be set and enforced with a hard guard at startup:

```typescript
if (process.env.EXECUTION_MODE !== 'SANDBOX') {
  throw new Error('Execution engine started without SANDBOX mode — refusing to run');
}
```

---

### 4.8 Notification Service

**Runtime:** Node.js / NestJS  
**DB:** MongoDB (`notifications`, `approval_requests`)  
**Port:** 3007 (internal) + push gateway (FCM/APNS)

#### Responsibility
Delivers push notifications and in-app alerts to customers when a new trade call is activated. Manages the approval flow: records the customer's go-ahead decision, handles approval expiry, and publishes approval events for the downstream order module (Phase 2).

#### Owns
```mongodb
// Collection: notifications
{
  _id:              ObjectId,
  user_id:          ObjectId,
  trade_call_id:    ObjectId | null,
  type:             "SIGNAL_ALERT" | "TP_HIT" | "SL_TRIGGERED" | "REVIEW_PENDING",
  body:             String,
  sent_at:          ISODate,
  read_at:          ISODate | null
}

// Collection: approval_requests
{
  _id:              ObjectId,
  user_id:          ObjectId,
  trade_call_id:    ObjectId,
  status:           "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED",
  approved_qty:     Number | null,
  responded_at:     ISODate | null,
  expires_at:       ISODate           // created_at + configurable TTL (default 5 min)
}
```

#### Consumes
```
trade_call.activated   → create ApprovalRequest for each subscribed user, send push
execution.tp_hit       → send "TP1 hit!" push to subscribed users
execution.sl_triggered → send "SL triggered" push to subscribed users
subscription.expired   → suppress further signals for that user
```

#### Publishes
```
approval.given    { user_id, trade_call_id, approved_qty }
approval.rejected { user_id, trade_call_id }
approval.expired  { user_id, trade_call_id }
```

#### HTTP API
```
POST /approve/:trade_call_id  { qty }  → record approval, publish approval.given
POST /reject/:trade_call_id          → record rejection
GET  /notifications                  → user's notification history
```

#### Does NOT
- Execute or simulate orders
- Manage TradeCall state directly (publishes events, others react)
- Hold broker credentials

---

### 4.9 Analytics Service

**Runtime:** Node.js / NestJS  
**DB:** MongoDB (`channel_scores`, `pnl_snapshots`)  
**Port:** 3008 (internal)

#### Responsibility
Read-only aggregation service. Consumes execution events and computes performance metrics: per-channel win rate, average return, drawdown, and a rolling equity curve. Provides the data that powers admin and trader dashboards.

#### Owns
```mongodb
// Collection: channel_scores  (updated after each trade close)
{
  _id:              ObjectId,
  channel_id:       String,
  total_signals:    Number,
  wins:             Number,
  losses:           Number,
  win_rate_pct:     Number,
  avg_return_pct:   Number,
  best_trade_pct:   Number,
  worst_trade_pct:  Number,
  equity_curve:     [{ date: ISODate, cumulative_pnl_pct: Number }],
  last_updated:     ISODate
}

// Collection: pnl_snapshots  (one per closed position)
{
  _id:              ObjectId,
  trade_call_id:    ObjectId,
  channel_id:       String,
  instrument:       String,
  segment:          Enum,
  direction:        Enum,
  entry_price:      Decimal128,
  close_reason:     String,
  gross_pnl_pct:    Number,
  closed_at:        ISODate
}
```

#### Consumes
```
execution.position_closed → upsert channel_scores, insert pnl_snapshot
```

#### HTTP API
```
GET  /analytics/channels                        → list all channels with scores
GET  /analytics/channels/:id                    → full score + equity curve
GET  /analytics/channels/:id?segment=EQUITY     → filtered breakdown
GET  /analytics/summary                         → platform-wide stats (admin)
```

#### Does NOT
- Write to trade_calls or execution_events
- Subscribe to market tick feeds
- Send notifications
- Authenticate users beyond what API gateway provides

---

## 5. Shared Libraries

These are internal npm packages in the `libs/` folder of the monorepo. They have no runtime process — they are compile-time dependencies only.

| Package | Contents |
|---|---|
| `@cai/types` | TypeScript interfaces for `TradeCall`, `RawMessage`, `ExecutionEvent`, `NormalisedTick`, `UserProfile`, all enums |
| `@cai/events` | Event payload schemas (TypeScript types + Zod validation schemas for producer/consumer parity) |
| `@cai/logger` | Structured JSON logger (wraps pino), ensures `service`, `request_id`, `trade_call_id` are always present in log lines |
| `@cai/config` | Config loader using `@nestjs/config` with Zod validation; each service defines its own schema, shared env var names live here |
| `@cai/db` | MongoDB connection factory, base repository class with typed queries, index definitions per collection |
| `@cai/queue` | Publisher and consumer base classes; wraps Redis Streams / RabbitMQ; handles serialisation, dead-letter routing, and retry |

---

## 6. Inter-Service Communication

### Synchronous (HTTP/gRPC)
Used for: read queries, admin actions, user-facing API calls.

- API Gateway → all services: **HTTP/REST**
- Signal Parser → Market Data (instrument validation): **HTTP** (internal)
- Trade Call → User Service (influencer lookup): **HTTP** (internal)
- Analytics → (read its own DB, no service calls needed)

### Asynchronous (Message Queue)
Used for: the main data pipeline. Every step from channel ingestion to execution result.

```
message.received    ─► signal-parser-service
trade_call.created  ─► trade-call-service
message.needs_review─► trade-call-service (review queue)
trade_call.activated─► execution-engine-service, notification-service
tick.price_update   ─► execution-engine-service
execution.*         ─► trade-call-service, analytics-service, notification-service
approval.*          ─► (Phase 2: order-service)
```

### Queue Technology: Redis Streams (Phase 1) → RabbitMQ (Phase 2+)

Start with **Redis Streams**: already in your stack (used for dedup cache), zero new infra, sufficient for Phase 1 throughput.

Migrate to **RabbitMQ** at Phase 2 when:
- You need dead-letter queue with per-message TTL
- You need message replay from a specific offset across services
- Multiple consumer groups on `tick.price_update` become complex

---

## 7. Event Catalogue

Complete list of all events in the system. Every event must include:
- `event_id` — UUID v4
- `event_type` — string (the name below)
- `produced_by` — service name
- `produced_at` — ISO8601
- `payload` — typed per event

| Event | Producer | Consumers |
|---|---|---|
| `message.received` | channel-connector | signal-parser |
| `message.needs_review` | signal-parser | trade-call |
| `trade_call.created` | signal-parser | trade-call |
| `trade_call.activated` | trade-call | execution-engine, notification |
| `trade_call.updated` | trade-call | notification |
| `trade_call.closed` | trade-call | analytics, notification |
| `tick.price_update` | market-data | execution-engine |
| `execution.entry_simulated` | execution-engine | trade-call |
| `execution.tp_hit` | execution-engine | trade-call, notification, analytics |
| `execution.tsl_advanced` | execution-engine | trade-call |
| `execution.sl_triggered` | execution-engine | trade-call, notification |
| `execution.position_closed` | execution-engine | analytics, notification, trade-call |
| `user.registered` | user | notification |
| `subscription.expired` | user | notification, trade-call |
| `approval.given` | notification | (Phase 2: order-service) |
| `approval.rejected` | notification | (logged only in Phase 1) |

---

## 8. Data Ownership Map

Only the **owning service** may write to a collection. Any other service that needs the data reads it via the owner's HTTP API or via events.

| Collection | Owner | Other readers |
|---|---|---|
| `raw_messages` | channel-connector | trade-call (status updates via event-driven write) |
| `channel_registry` | channel-connector | signal-parser (channel active check), trade-call |
| `trade_calls` | trade-call | execution-engine (via event), analytics (via event) |
| `review_queue` | trade-call | admin portal (via trade-call HTTP API) |
| `virtual_positions` | execution-engine | analytics (via event only) |
| `execution_events` | execution-engine | analytics (via event only) |
| `users` | user | api-gateway (JWT verify), trade-call (influencer lookup) |
| `broker_configs` | user | (Phase 2: order-service only) |
| `subscriptions` | user | notification, trade-call |
| `notifications` | notification | — |
| `approval_requests` | notification | (Phase 2: order-service) |
| `channel_scores` | analytics | admin portal, trader dashboard |
| `pnl_snapshots` | analytics | admin portal, trader dashboard |

---

## 9. Monorepo Folder Structure

```
cai/
├── apps/
│   ├── api-gateway/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   └── proxy.module.ts
│   │   ├── Dockerfile
│   │   └── project.json              ← Nx project config
│   │
│   ├── user-service/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── broker-config/
│   │   │   └── subscriptions/
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   ├── channel-connector-service/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── adapters/
│   │   │   │   ├── telegram.adapter.ts
│   │   │   │   └── whatsapp.adapter.ts
│   │   │   ├── channel-registry/
│   │   │   └── raw-messages/
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   ├── signal-parser-service/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── classifier/
│   │   │   ├── extractor/
│   │   │   ├── normaliser/
│   │   │   └── validator/
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   ├── trade-call-service/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── trade-calls/
│   │   │   ├── review-queue/
│   │   │   └── state-machine/
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   ├── market-data-service/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── broker-adapters/
│   │   │   │   ├── zerodha.adapter.ts
│   │   │   │   ├── upstox.adapter.ts
│   │   │   │   └── angel-one.adapter.ts
│   │   │   ├── instrument-master/
│   │   │   └── tick-publisher/
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   ├── execution-engine-service/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── position-manager/
│   │   │   ├── trailing-sl/
│   │   │   └── virtual-ledger/
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   ├── notification-service/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── push/
│   │   │   ├── approval/
│   │   │   └── history/
│   │   ├── Dockerfile
│   │   └── project.json
│   │
│   └── analytics-service/
│       ├── src/
│       │   ├── main.ts
│       │   ├── channel-scores/
│       │   └── pnl-snapshots/
│       ├── Dockerfile
│       └── project.json
│
├── libs/
│   ├── types/                        ← @cai/types
│   │   └── src/
│   │       ├── trade-call.types.ts
│   │       ├── raw-message.types.ts
│   │       ├── execution.types.ts
│   │       └── index.ts
│   │
│   ├── events/                       ← @cai/events
│   │   └── src/
│   │       ├── events.ts             ← all event payload types
│   │       └── schemas.ts            ← Zod schemas for runtime validation
│   │
│   ├── logger/                       ← @cai/logger
│   ├── config/                       ← @cai/config
│   ├── db/                           ← @cai/db
│   └── queue/                        ← @cai/queue
│
├── infra/
│   ├── docker-compose.yml            ← local dev: all services + MongoDB + Redis
│   ├── docker-compose.test.yml       ← integration test environment
│   └── k8s/                          ← Kubernetes manifests (Phase 2)
│
├── nx.json
├── package.json                      ← pnpm workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json                ← shared TS config, path aliases (@cai/*)
```

---

## 10. Infrastructure & Deployment

### Phase 1 — Local / Small Cloud (MVP)

| Component | Technology | Notes |
|---|---|---|
| Services | Docker containers | 9 containers via Docker Compose in dev |
| MongoDB | MongoDB Atlas M10 | Separate DB per service (channel_db, trade_db, exec_db, analytics_db, user_db) |
| Redis | Redis Cloud or self-hosted | Tick cache + message queue (Streams) |
| Queue | Redis Streams | Sufficient for Phase 1 message volume |
| Hosting | Railway / Render / single VM | Single-node; scale per service independently |
| CI | GitHub Actions + Nx affected | Only builds/tests changed services |
| Secrets | `.env` in dev, AWS Secrets Manager in production | |

### Phase 2 — Production Scale

| Component | Technology |
|---|---|
| Orchestration | Kubernetes (EKS/GKE) |
| Message Queue | RabbitMQ (replaces Redis Streams) |
| Tick distribution | Redis pub/sub (inside market-data-service; high frequency) |
| Service mesh | Linkerd (lightweight) or Istio |
| Observability | OpenTelemetry → Grafana Cloud (logs + traces + metrics) |
| Secrets | HashiCorp Vault |

### Scaling Notes per Service

| Service | Scaling Axis | Notes |
|---|---|---|
| channel-connector | Vertical | I/O bound; one healthy instance handles both WA + TG in Phase 1 |
| signal-parser | Horizontal | CPU/GPU bound if local ML model; scale based on queue depth |
| trade-call | Horizontal | Stateless HTTP; scale behind a load balancer |
| market-data | Vertical | WebSocket connections are stateful; scale by instrument set partitioning |
| execution-engine | Horizontal (with care) | In-memory position map must be partitioned by instrument; use consistent hashing |
| notification | Horizontal | Stateless; scale based on queue depth |
| analytics | Vertical | Aggregation queries; read replica recommended |

---

## 11. Technology Decisions

### Language: TypeScript / Node.js for all services (primary)

**Why not Go or Java?**
Your existing codebase (`procureai-backend`) is NestJS. Staying in the same ecosystem means:
- Shared tooling, shared `libs/` packages
- Engineers context-switch between services without language overhead
- NestJS has excellent queue consumer support via `@nestjs/bullmq` or custom Redis Stream consumers

**Exception:** If you choose a local ML model (not Claude API) for the parser, the model inference layer runs in Python/FastAPI. The NestJS consumer calls it over HTTP internally.

### NLP/Parsing: Claude API (recommended for Phase 1)

Instead of training a custom model, use Claude with a structured-output schema. This gives you:
- Zero ML infra to manage
- Model upgrades for free
- High accuracy on natural-language trade signals out of the box
- `model_version` field in every parse result enables auditable rollback

Switch to a fine-tuned local model in Phase 2 if cost per parse becomes significant at scale.

### MongoDB for most services

Trade call data, execution events, and raw messages are document-oriented and schema-flexible (different segments have different fields). MongoDB is the right fit. PostgreSQL is used only in user-service where relational constraints (subscriptions, users, broker configs) matter.

### No shared database

Each service has its own MongoDB database (not just a collection in a shared instance). This enforces ownership and prevents services from bypassing the event/API boundary by querying another service's collection directly. In Atlas, this means separate databases within the same cluster (same billing, separate access controls).

---

## 12. Anti-Patterns to Avoid

These are the mistakes most commonly made in microservice systems at this scale. Each one has a concrete example from this project.

### 1. Distributed Monolith
**What it looks like:** Service A can't start without Service B; deploy them together.  
**CAI example:** Execution Engine calling Trade Call Service's HTTP API synchronously to check SL levels on every tick.  
**Fix:** Execution Engine holds its own copy of active position data (hydrated from events). It never calls Trade Call over HTTP in the hot path.

### 2. Shared Database
**What it looks like:** Signal Parser writes directly to `trade_calls` collection.  
**Fix:** Signal Parser emits `trade_call.created` event. Trade Call Service is the only writer.

### 3. Business Logic in the Gateway
**What it looks like:** API Gateway validates the trade instrument name.  
**Fix:** The Gateway only checks JWT and routes. Instrument validation lives in Signal Parser (via Market Data lookup).

### 4. Fat Events (over-sharing in events)
**What it looks like:** `trade_call.activated` contains the full 30-field TradeCall document.  
**Fix:** `trade_call.activated` contains only what consumers need: `trade_call_id`, `instrument`, `entry_price`, `stop_loss`, `targets`, `trailing_sl`. Consumers that need more call the Trade Call Service HTTP API.

### 5. Synchronous Pipeline
**What it looks like:** Channel Connector calls Signal Parser HTTP endpoint synchronously. If parser is slow, the webhook times out.  
**Fix:** Channel Connector writes to MongoDB and publishes to queue. It acknowledges the platform webhook immediately. Parser processes asynchronously.

### 6. No Dead-Letter Strategy
**What it looks like:** A malformed message causes the parser consumer to crash-loop.  
**Fix:** Every queue consumer has a `maxRetries` (3) and a dead-letter destination. Dead-lettered messages are stored in a `failed_events` collection for human inspection without blocking the pipeline.

---

## Summary

| Decision | Choice | Reason |
|---|---|---|
| Monorepo | **Yes — Nx + pnpm** | Shared types, atomic refactors, small team |
| Services | **9 services** | Each has exactly one reason to change |
| Queue | **Redis Streams → RabbitMQ** | Start simple, migrate when warranted |
| NLP | **Claude API** | No ML infra in Phase 1 |
| Databases | **MongoDB + PostgreSQL (user-service only)** | Right fit per domain |
| Communication | **HTTP for queries, Events for pipeline** | Never sync HTTP in hot path |
| Sandbox guard | **Hard `EXECUTION_MODE=SANDBOX` check** | Cannot accidentally send real orders |

---

*CAI Technical Architecture — v1.0 — October 2026 — Confidential*
