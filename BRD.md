Business Requirements Document

# CAI — Channel AI Intelligence

Automated trade signal ingestion, parsing, and virtual execution from social media channels — WhatsApp, Telegram, and beyond.

Version 1.0 — Draft

Date October 2026

Author Ajai Mishra

Status Under Review

▾ Table of Contents

[Abstract](#abstract) [Business Context](#context) [Objectives](#objectives) [Scope](#scope) [Epics & Features](#epics) [User Stories](#stories) [Use Cases](#use-cases) [Data Model](#data-model) [Non-Functional Requirements](#nfr) [Glossary](#glossary)

Contents

[Abstract](#abstract) [Business Context](#context) [Objectives](#objectives) [Scope](#scope) [Epics & Features](#epics) [User Stories](#stories) [Use Cases](#use-cases) [Data Model](#data-model) [Non-Functional Req.](#nfr) [Glossary](#glossary)

§ 01

## Abstract

CAI (Channel AI Intelligence) is an automated trading-signal platform that monitors social media channels — WhatsApp, Telegram, and similar — for trade recommendations posted by financial influencers and subject-matter experts. Raw, unstructured messages are ingested in real time, parsed by an AI-powered extraction engine into a canonical trade-call schema (instrument, segment, entry price, stop-loss, and tiered profit targets), and persisted in a document store. A virtual execution engine then replays each trade call against live broker-tick data in a sandboxed environment, recording performance without risking real capital. The system also implements a dynamic trailing stop-loss mechanism that automatically advances the stop price as the market moves in the trader's favour, protecting accumulated gains. CAI transforms a dependency on expensive human experts into a scalable, auditable, and automation-ready workflow — enabling retail traders and small trading desks to act on expert signals faster, more consistently, and with quantified risk control.

3

Core Epics

4+

Market Segments

∞

Signal Channels

0

Real Capital at Risk (Phase 1)

§ 02

## Business Context & Problem Statement

Retail traders increasingly rely on paid Telegram channels and WhatsApp groups managed by certified financial analysts or popular market influencers. These channels broadcast trade recommendations — called _trade calls_ — in informal, unstructured text. Acting on them today requires a human to:

- Read and interpret the message manually (introducing interpretation errors).
- Log into a broker terminal and enter the trade parameters by hand.
- Monitor the position continuously for stop-loss and target triggers.
- Adjust the stop-loss upward as profit accrues — a discipline many miss.

#### Current Pain Points

- Signals arrive at any hour; missed messages mean missed trades.
- Human parsing introduces typos and mis-entries (wrong price or wrong segment).
- No systematic stop-loss discipline — traders hold losing positions too long.
- No historical record of signal quality from a given channel.
- Scaling requires hiring more analysts or traders.

#### Opportunity

- 24/7 automated monitoring removes the dependency on human availability.
- AI parsing eliminates transcription errors and standardises the schema.
- Trailing SL locks in profits algorithmically, removing emotional bias.
- Virtual execution backtests every signal channel — quantifying which experts are worth following.
- A structured data layer enables future live-trade automation via broker APIs.

§ 03

## Objectives & Success Metrics

#### OBJ-1 — Signal Capture

Ingest ≥ 95% of trade messages from subscribed channels within 30 seconds of posting.

#### OBJ-2 — Parse Accuracy

Correctly extract all mandatory trade fields (instrument, SP, SL, TP) with ≥ 98% accuracy on well-formed messages.

#### OBJ-3 — Dynamic SL

Trailing stop-loss updates within 1 market-tick latency when a TP level is breached or price advances beyond the configured step.

#### OBJ-4 — Virtual Execution

Every trade call is simulated against real market ticks with P&L recorded, enabling signal-quality scoring per channel.

#### OBJ-5 — Auditability

Every raw message, parsed call, and execution event is stored with a full immutable audit trail including timestamps and source channel.

#### OBJ-6 — Extensibility

The channel connector and segment engine are modular, allowing new platforms (X/Twitter, Discord) and segments (Crypto) to be added without core changes.

§ 04

## Scope

### Supported Market Segments

Equity Commodity Futures & Options Forex

#### In Scope — Phase 1

- WhatsApp and Telegram channel monitoring
- AI-powered NLP signal parser (text → JSON)
- MongoDB document store for raw + parsed messages
- Trade call creation, validation, and status management
- Dynamic trailing stop-loss engine
- Virtual/sandbox trade execution against broker tick feed
- Per-channel signal performance reporting

#### Out of Scope — Phase 1

- Live trade execution with real capital
- User-facing portfolio management
- Tax / regulatory reporting
- Mobile application (Phase 2)
- Crypto / digital-asset segments (Phase 2)
- X (Twitter) and Discord connectors (Phase 2)
- KYC / AML compliance module

§ 05

## Epics & Features

EPIC-1

### Signal Ingestion — Channel Monitor & Raw Store

Fetch trade messages from WhatsApp and Telegram in real time and persist the raw, unaltered content in MongoDB for full auditability. Each message is tagged with its source channel, sender identity, and arrival timestamp.

#### Key Features

- **Channel Connector** — Webhook / polling adapters for WhatsApp Business API and Telegram Bot API.
- **Raw Message Store** — Immutable append-only collection in MongoDB; every message stored exactly once.
- **Deduplication** — Message-ID hash guard prevents double-processing of retransmitted messages.
- **Channel Registry** — Admin-configurable list of monitored groups/channels with metadata (analyst name, segment focus, subscription tier).
- **Ingestion Queue** — Message broker (e.g. RabbitMQ/Redis Streams) decouples ingestion from parsing for resilience under burst.

EPIC-2

### Trade Call Parser & Validation Engine

For each raw message that passes a relevance filter, extract structured trade parameters and create or update a canonical `TradeCall` document. Validates mandatory fields, detects conflicts, and flags ambiguous signals for human review.

#### Signal Transformation Example

Raw WhatsApp Message

🔥 Buy INFY now around 1600\
SL below 1520\
Targets: 1680 / 1760 / 1840\
Equity segment. Risk 2%.

→

Parsed TradeCall JSON

{\
"instrument": "INFY",\
"segment": "EQUITY",\
"direction": "BUY",\
"entry_price": 1600,\
"stop_loss": 1520,\
"targets": \[1680, 1760, 1840\],\
"target_split_pct": \[30, 30, 40\],\
"trailing_sl": true,\
"risk_pct": 2,\
"confidence": 0.97\
}

#### Key Features

- **NLP Relevance Classifier** — Identifies whether a message is a trade signal, commentary, or noise.
- **Field Extractor** — Extracts instrument ticker, segment, direction (Buy/Sell), entry price, stop-loss level, and up to 3 target levels.
- **Tiered Target Split** — Allows the user to configure what percentage of the position to close at each TP (e.g. 30 / 30 / 40).
- **Ambiguity Flag** — Signals where confidence \< 0.85 are flagged `NEEDS_REVIEW` and routed to an admin queue.
- **Update Detection** — If the same instrument from the same channel within 24h receives a new message with adjusted levels, the existing TradeCall is updated, not duplicated.

EPIC-3

### Virtual Trade Execution & Trailing SL Engine

Subscribe to real-time market ticks from a broker API. For each active TradeCall, simulate order entry, monitor price against SL and TP levels, close partial positions at each TP, and advance the trailing stop-loss as the position moves into profit. All outcomes are recorded for performance analytics.

#### Trailing Stop-Loss — How It Works

INFY — Entry 1600 · Initial SL 1520 · TP1 1680 · TP2 1760 · TP3 1840

1600

BUY

Entry\
SL: 1520

1680

TP1

30% sold\
SL→ 1600

1760

TP2

30% sold\
SL→ 1680

1840

TP3

40% sold\
Full exit

Trailing SL rule: SL advances to the previous TP price each time a new TP is breached. | If price drops to current SL at any stage, remaining position exits immediately.

#### Key Features

- **Broker Tick Subscriber** — Connects to any supported broker API (Zerodha, Upstox, Angel One) via WebSocket for real-time price ticks.
- **Order Simulator** — Simulates BUY/SELL orders at the bid/ask prevailing at decision time; records slippage delta.
- **Trailing SL Engine** — Stateful per-position engine that tracks the current SL, advancing it whenever a TP is hit or a configurable price step is exceeded.
- **Partial-Exit Logic** — Closes _N_% of the virtual position at each TP, configurable per TradeCall.
- **Sandbox Recording** — Full ledger of every simulated fill, SL adjustment, and final close event for auditability and channel scoring.

§ 06

## User Stories

Stories follow the standard _As a \[role\] / I want to \[goal\] / So that \[outcome\]_ pattern, with acceptance criteria written in Gherkin.

US-001 Ingest trade signal from Telegram channel EPIC-1 Must Have

As a _retail trader_,\
I want the system to automatically capture every message posted in my subscribed Telegram channels,\
so that I never miss a trade call even when I'm away from my phone.

Scenario: New trade message posted in a subscribed Telegram channel\
Given the Telegram channel "@StockMasterPro" is in the system's channel registry\
And the channel monitor is running\
When an influencer posts: "Buy INFY @ 1600. SL \<1520. TP 1680/1760/1840"\
Then a raw message document is written to MongoDB within 30 seconds\
And the document contains: source_channel, sender_id, raw_text, received_at\
And the message is placed on the parsing queue\
\
Scenario: Duplicate message arrives (retransmit)\
Given message_id "tg-8823991" is already stored\
When the same message_id arrives again\
Then no new document is written\
And a deduplication counter is incremented and logged

US-002 Parse unstructured signal into structured trade call EPIC-2 Must Have

As a _system administrator_,\
I want every relevant message to be automatically converted into a validated TradeCall record,\
so that downstream execution requires no manual transcription.

Scenario: Well-formed equity signal parsed correctly\
Given raw message: "GOLD BUY @ 1600. SL below 1520. TP1=1680, TP2=1760, TP3=1840. Commodity."\
When the parser processes the message\
Then a TradeCall is created with:\
instrument="GOLD", segment="COMMODITY", direction="BUY"\
entry_price=1600, stop_loss=1520, targets=\[1680, 1760, 1840\]\
And status is set to "ACTIVE"\
\
Scenario: Ambiguous message flagged for human review\
Given raw message: "INFY looking good, might enter if it sustains 1600"\
When the classifier assigns confidence 0.62\
Then the message is stored with status "NEEDS_REVIEW"\
And no TradeCall is created\
And an alert is sent to the admin review queue

US-003 Configure tiered profit-taking split per trade EPIC-2 Should Have

As a _trader_,\
I want to specify what percentage of my position to close at each target level,\
so that I can lock in partial profits while letting the rest run.

Scenario: Trader sets 30/30/40 split for INFY trade call\
Given TradeCall for INFY with targets \[1680, 1760, 1840\] is ACTIVE\
And trader configures target_split_pct = \[30, 30, 40\]\
When market price reaches 1680 (TP1)\
Then 30% of the virtual position is closed at 1680\
And remaining 70% continues open\
When market price reaches 1760 (TP2)\
Then 30% of original position is closed at 1760\
And remaining 40% continues open\
When market price reaches 1840 (TP3)\
Then final 40% is closed at 1840 and trade is marked COMPLETED

US-004 Trailing stop-loss advances as price rises EPIC-3 Must Have

As a _trader_,\
I want my stop-loss to automatically move to my last target price each time a new target is hit,\
so that I protect accumulated gains and cannot lose more than my entry price once TP1 is reached.

Scenario: Trailing SL advances to entry after TP1 is hit (breakeven protection)\
Given INFY trade: entry=1600, initial_SL=1520, TP1=1680\
When tick price crosses 1680\
Then SL is moved from 1520 → 1600 (entry price — breakeven)\
And the SL update is recorded with timestamp\
\
Scenario: Price drops to trailing SL — remaining position exits\
Given SL is currently at 1680 (after TP2 was hit)\
When tick price falls to 1680 or below\
Then the remaining position is closed at market\
And trade status is set to "CLOSED_SL"\
And net P&L is recorded and attributed to the signal channel

US-005 View signal-channel performance dashboard EPIC-3 Should Have

As a _trader_,\
I want to see a performance scorecard for each Telegram/WhatsApp channel I subscribe to,\
so that I can decide which analysts to trust and which to unsubscribe from.

Scenario: Dashboard shows win rate and avg P&L per channel\
Given channel "@StockMasterPro" has 50 completed virtual trades\
When I open the channel performance view\
Then I see: total signals, win rate %, avg return %, best trade, worst trade\
And a breakdown by segment (Equity, Commodity, F&O, Forex)\
And a 30-day rolling equity curve chart for that channel

§ 07

## Use Cases

UC-01

### End-to-End: Equity Trade Signal — INFY Buy

Actors: Telegram Influencer · CAI System · Broker Tick API · Trader (observer)

| Attribute      | Detail                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Precondition   | Channel "@NSEAlerts" is registered. CAI monitor is running. Broker tick feed is connected for NSE Equity.                     |
| Trigger        | Influencer posts: `"🔥 BUY INFY around 1600. SL: exit below 1520. TP1=1680, TP2=1760, TP3=1840. Risk 2% of capital. Equity."` |
| Post-condition | Trade is fully closed with all P&L events recorded. Trailing SL history is stored.                                            |

#### Main Success Flow

1

Telegram connector receives the message within 5 seconds of posting and writes a raw document to MongoDB with `status: "RAW"`.

2

NLP classifier scores the message at 0.97 confidence (trade signal). Parser extracts: instrument=INFY, segment=EQUITY, direction=BUY, entry=1600, SL=1520, targets=\[1680, 1760, 1840\].

3

System creates a `TradeCall` document with `status: "ACTIVE"`, target_split=\[30,30,40\], trailing_sl=true.

4

Execution engine subscribes to INFY NSE tick feed. At the next tick at or below 1600, a virtual BUY is simulated for a quantity derived from the 2% risk rule.

5

INFY rises to 1680 (TP1). Engine closes 30% of virtual position. Trailing SL advances from 1520 → 1600. `ExecutionEvent` recorded: type=TP1_HIT, proceeds=1680×30%qty.

6

INFY rises to 1760 (TP2). Engine closes 30%. SL advances from 1600 → 1680.

7

INFY rises to 1840 (TP3). Engine closes final 40%. Trade status updated to `COMPLETED_ALL_TARGETS`. Net virtual P&L posted to channel score.

↗

**Alternate Path — Price drops to trailing SL at step 6:** If after TP1 is hit (SL now at 1600), price falls back to 1600 before reaching TP2, the remaining 70% is closed at 1600 (breakeven). Trade status becomes `CLOSED_SL_BREAKEVEN`. The trader loses nothing; TP1 gains are locked.

UC-02

### Commodity Trade Signal — GOLD Buy with Trailing SL Triggered Mid-Trade

Actors: WhatsApp Channel · CAI System · MCX Tick API

| Attribute     | Detail                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| Signal Source | WhatsApp group "MCX Commodity Calls"                                                |
| Raw Message   | `"GOLD MCX BUY @ 1600. SL 1520. Targets 1680, 1760, 1840. Commodity Seg."`          |
| Scenario      | TP1 hit at 1680; price reverses and hits trailing SL at 1600 before TP2 is reached. |

#### Execution Flow

1

WhatsApp API webhook fires. Raw message stored. Parser creates TradeCall: GOLD, COMMODITY, BUY, entry=1600, SL=1520.

2

MCX tick at 1600 → virtual BUY executed. Active SL = 1520.

3

MCX tick reaches 1680 (TP1). 30% of position closed. **Trailing SL advances: 1520 → 1600.**

4

Price reverses. MCX tick reaches 1600. Trailing SL triggered. Remaining 70% of virtual position closed at 1600 (breakeven on remaining lot).

5

Trade closed as `CLOSED_SL_AFTER_TP1`. P&L = profit from 30% TP1 exit + zero gain/loss on remainder. Channel score updated accordingly.

Price path: 1600 → 1670 → 1700 → 1580 (via Trailing SL at 1600)

1600

ENTRY

SL: 1520

1680

TP1

30% out\
SL→1600

1600

TSL HIT

70% closed\
Breakeven

UC-03

### Ambiguous Signal — Human Review Required

Actors: Telegram Channel · CAI Parser · Admin

| Attribute   | Detail                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Raw Message | `"INFY showing great momentum, might be a good entry around 1600 levels if market cooperates 🤔"` |
| Issue       | No explicit SL, no explicit TP, direction is implied not stated. Confidence = 0.58.               |

#### Flow

1

Message stored as raw document.

2

NLP classifier scores it 0.58. Relevance = probable trade commentary, not an actionable call. Mandatory fields SL and TP are absent.

3

Document stored with `status: "NEEDS_REVIEW"`. **No TradeCall is created.**

4

Admin review queue shows the message. Admin can: (a) manually fill missing fields and promote to ACTIVE TradeCall, (b) reject as non-actionable, or (c) mark as commentary for channel quality metrics.

UC-04

### Futures & Options — Nifty PUT Trade Signal

Actors: Telegram Channel · CAI System · NSE F&O Tick Feed

| Attribute     | Detail                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Raw Message   | `"NIFTY 21500 PE SEP Expiry — BUY @ 120. SL: 80. TP1: 160, TP2: 200. F&O."`                                |
| Parsed Output | instrument=NIFTY21500PE, segment=F_AND_O, expiry=SEP, direction=BUY, entry=120, SL=80, targets=\[160,200\] |

#### Additional Parsing Rules for F&O

- Instrument encodes: underlying (NIFTY), strike (21500), option type (PE/CE), and expiry (SEP).
- Expiry is resolved against the current NSE F&O expiry calendar to get the exact date.
- Virtual execution checks open interest and lot size from the broker API before simulating the order.
- At expiry, if the option is still open, the position is closed at intrinsic value or zero (for OTM).

§ 08

## Data Model

### RawMessage

{\
\_id: ObjectId,\
message_id: String, // platform ID\
source_platform: Enum, // TELEGRAM|WHATSAPP\
source_channel: String,\
sender_id: String,\
raw_text: String,\
media_urls: \[String\],\
received_at: ISODate,\
status: Enum, // RAW|PARSED|NEEDS_REVIEW|REJECTED\
trade_call_id: ObjectId?\
}

### TradeCall

{\
\_id: ObjectId,\
raw_message_id: ObjectId,\
instrument: String,\
segment: Enum, // EQUITY|COMMODITY|F_AND_O|FOREX\
direction: Enum, // BUY|SELL\
entry_price: Decimal,\
stop_loss: Decimal,\
current_sl: Decimal, // live trailing value\
targets: \[Decimal\],\
target_split: \[Int\], // pct per TP, sums to 100\
trailing_sl: Boolean,\
confidence: Float,\
status: Enum\
}

### ExecutionEvent

{\
\_id: ObjectId,\
trade_call_id: ObjectId,\
event_type: Enum, // ENTRY | TP1_HIT | TP2_HIT | TP3_HIT | SL_HIT | TSL_ADVANCE | EXPIRED | MANUAL_CLOSE\
tick_price: Decimal,\
qty_pct: Int, // % of original position involved\
pnl_delta: Decimal,\
new_sl: Decimal?, // for TSL_ADVANCE events\
recorded_at: ISODate\
}

§ 09

## Non-Functional Requirements

| ID     | Requirement                  | Category        | Target                                                                                                                                        | Priority |
| ------ | ---------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| NFR-01 | Message ingestion latency    | Performance     | Raw message stored within 30 s of platform posting                                                                                            | Must     |
| NFR-02 | Parser throughput            | Performance     | ≥ 100 messages/min with p99 latency \< 2 s                                                                                                    | Must     |
| NFR-03 | Trailing SL tick latency     | Performance     | SL updates applied within 1 broker tick (\< 500 ms after tick arrival)                                                                        | Must     |
| NFR-04 | Uptime                       | Reliability     | 99.5% availability during market hours (09:00–15:30 IST)                                                                                      | Must     |
| NFR-05 | Data immutability            | Reliability     | Raw message collection is append-only; no delete or update on raw documents                                                                   | Must     |
| NFR-06 | API credentials security     | Security        | Broker and platform API keys stored encrypted at rest (AES-256); never logged in plaintext                                                    | Must     |
| NFR-07 | Parser model versioning      | Maintainability | Each parse result stores the model version used; model can be rolled back without re-ingesting raw messages                                   | Should   |
| NFR-08 | Channel connector modularity | Extensibility   | Adding a new channel (e.g. Discord) requires only a new connector implementing the `IChannelAdapter` interface                                | Should   |
| NFR-09 | Observability                | Reliability     | Structured logs for every ingestion, parse, and execution event; alerting for queue depth > 500 or parse error rate > 5%                      | Should   |
| NFR-10 | Sandbox isolation            | Security        | Virtual execution engine must never issue real orders; sandbox and live modes are separate service instances with separate broker credentials | Must     |

§ 10

## Glossary

### Trade Call

A structured representation of a trade recommendation: instrument, direction, entry price, stop-loss, and one or more profit targets.

### SP — Strike / Entry Price

The price at which the trader enters the position. Called "SP" in source signals.

### SL — Stop-Loss

The price at which the position is closed to cap a loss. May be static or trailing.

### TP — Target Price

One of up to three price levels where a portion of the position is closed to realise profit (TP1, TP2, TP3).

### Trailing SL

A dynamic stop-loss that advances upward (for a long trade) as price rises through target levels, locking in gains.

### Signal Channel

A Telegram group, WhatsApp group, or similar platform channel monitored by CAI for trade recommendations.

### Virtual Execution

Simulated trade processing against real market ticks, with no actual capital deployed. Also called "paper trading" or "sandbox mode."

### Confidence Score

A 0–1 float produced by the NLP parser indicating how certain it is that a message is an actionable trade signal with all mandatory fields present.

### Target Split

The percentage of the total position closed at each TP level. Example: \[30, 30, 40\] means 30% at TP1, 30% at TP2, 40% at TP3.

### Tick

The smallest real-time price update broadcast by a broker's market-data WebSocket feed.

CAI — Channel AI Intelligence · BRD v1.0 · October 2026 · Confidential
