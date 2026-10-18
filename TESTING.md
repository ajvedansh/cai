# CAI — Testing Guide

> End-to-end test cases for the full signal pipeline: Telegram → Parser → Dashboard.

## Before you start

Make sure everything is running:

```bash
# Docker stack
docker-compose up -d

# ngrok tunnel
ngrok http --url=banked-rewind-hypnotist.ngrok-free.dev 3002
```

Open the dashboard: http://localhost:3000

Watch live logs while testing (optional but helpful):

```bash
docker-compose logs -f channel-connector-service signal-parser-service trade-call-service
```

---

## Test 1 — Simple BUY signal

**Send on Telegram (`@cai_dev_signal_bot`):**
```
BUY NIFTY 24500 SL 24300 TGT 24700
```

**Expected result:**
- ✅ Appears in **Trade Calls** within 5–10 seconds
- Instrument: `NIFTY`, Direction: `BUY`
- Entry: `24,500` · SL: `24,300` · Target: `24,700`
- Status: `ACTIVE`

---

## Test 2 — Signal with multiple targets

**Send on Telegram:**
```
RELIANCE BUY @ 2850. SL 2780. TP1=2950 TP2=3050 TP3=3150. Equity NSE
```

**Expected result:**
- ✅ Appears in **Trade Calls**
- Instrument: `RELIANCE`, Segment: `EQUITY`
- Entry: `2,850` · SL: `2,780`
- 3 targets: `2,950` · `3,050` · `3,150`
- Status: `ACTIVE`

---

## Test 3 — SELL signal (F&O)

**Send on Telegram:**
```
BANKNIFTY SELL 49000 SL 49300 TGT 48500 48000. F&O
```

**Expected result:**
- ✅ Appears in **Trade Calls**
- Instrument: `BANKNIFTY`, Direction: `SELL`, Segment: `F&O`
- Entry: `49,000` · SL: `49,300` · Targets: `48,500` · `48,000`
- Status: `ACTIVE`

---

## Test 4 — Partial signal → Review Queue

**Send on Telegram:**
```
BANKNIFTY short 48500
```

**Expected result:**
- ⚠️ Goes to **Review Queue** (amber dot on sidebar), NOT Trade Calls
- Missing fields: SL and targets shown in amber chips
- You can click **Promote** → fill in missing fields → manually approve it

---

## Test 5 — Reply chain (two-part signal via Telegram reply)

An influencer posts the entry first, then **replies to their own message** with SL and targets.

**Step 1 — Post this on Telegram:**
```
INFY BUY 1600
```

**Step 2 — In Telegram, long-press that message → Reply, then send:**
```
SL 1520 TGT 1680 1760 1840
```

**What happens internally:**  
The channel-connector reads Telegram's `reply_to_message` field and stitches both parts as:
```
[QUOTE]: INFY BUY 1600
[REPLY]: SL 1520 TGT 1680 1760 1840
```
This combined text is sent to the signal parser.

**Expected result:**
- ✅ Appears in **Trade Calls** with full details
- Instrument: `INFY`, Direction: `BUY`
- Entry: `1,600` · SL: `1,520` · Targets: `1,680` · `1,760` · `1,840`
- Status: `ACTIVE`

**Verify via API:**
```bash
curl http://localhost:3004/trade-calls \
  -H "x-api-key: dev-api-key-change-in-prod" | python3 -m json.tool
```

---

## Test 5A — Sequential messages (no Telegram reply, same sender within 5 min)

An influencer posts two separate messages (does NOT use Telegram reply). The system automatically stitches them because they come from the same sender in the same channel within 5 minutes.

**Step 1 — Post this on Telegram (do NOT reply — just send a new message):**
```
NIFTY BUY 24500 SL 24200
```

**Step 2 — Within 5 minutes, post another new message (not a reply):**
```
Target 24700 24900 25100
```

**What happens internally:**  
When the second message arrives, the webhook handler calls `findRecentFromSender()`. It finds the first message (within the 5-min window) and stitches them:
```
[QUOTE]: NIFTY BUY 24500 SL 24200
[REPLY]: Target 24700 24900 25100
```

**Expected result:**
- ✅ Appears in **Trade Calls** as a single complete signal
- Instrument: `NIFTY`, Direction: `BUY`
- Entry: `24,500` · SL: `24,200` · 3 targets
- Status: `ACTIVE`

**Test via API (simulates two sequential messages):**
```bash
# Message 1 — partial signal
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{
    "raw_text": "NIFTY BUY 24500 SL 24200",
    "source_channel": "seq-test",
    "sender_id": "influencer-001"
  }'

# Wait a few seconds, then send Message 2 — follow-up from same sender
sleep 5

curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{
    "raw_text": "Target 24700 24900 25100",
    "source_channel": "seq-test",
    "sender_id": "influencer-001"
  }'
```

**Check logs to confirm stitching occurred:**
```bash
docker-compose logs channel-connector-service | grep -i "sequential stitch"
```
You should see:
```
Sequential stitch applied for sender influencer-001 on channel seq-test
```

**Verify the trade call:**
```bash
curl "http://localhost:3004/trade-calls?limit=5" \
  -H "x-api-key: dev-api-key-change-in-prod" | python3 -m json.tool
```

---

## Test 5B — SL / TP update on existing trade call (update_history preserved)

An influencer posts a valid signal, then later **comments on their own post** with revised SL or targets. The system must:
1. Detect this is an update to an existing open trade call (same instrument + channel, within 24h)
2. Overwrite the SL/targets with the new values
3. Keep a full history snapshot of the old values in `update_history`

**Step 1 — Post the original signal:**
```
RELIANCE BUY 2850 SL 2780 TGT 2950 3050
```

**Step 2 — After a minute, reply to it (or post a new message) from the same account:**
```
RELIANCE revised SL to 2800. New targets 2970 3080 3200
```

**What happens internally:**
- First message → new `TradeCall` created (`status: ACTIVE`, `parsed_data` stored)
- Second message → parser extracts same instrument `RELIANCE` + same channel → `createFromEvent` finds the existing open trade call → **before overwriting**, pushes current values to `update_history` array

**Expected result in Trade Calls:**
- `initial_sl` → `2,800` (new value)
- `targets` → `[2,970, 3,080, 3,200]` (new values)
- `update_history` has **1 entry** containing the old snapshot:
  - `initial_sl: 2780`
  - `targets: [2950, 3050]`
  - `updated_at: <timestamp>`

**Test via API using `quoted_text` field** (simulates a reply with context):
```bash
# Step 1 — Original signal
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{
    "raw_text": "RELIANCE BUY 2850 SL 2780 TGT 2950 3050",
    "source_channel": "update-test",
    "sender_id": "influencer-001"
  }'

# Wait for it to process
sleep 10

# Step 2 — Update signal (quoted_text simulates the Telegram reply context)
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{
    "raw_text": "Revised SL to 2800. New targets 2970 3080 3200",
    "quoted_text": "RELIANCE BUY 2850 SL 2780 TGT 2950 3050",
    "source_channel": "update-test",
    "sender_id": "influencer-001"
  }'

# Wait for the update to process
sleep 10
```

**Verify the update_history was saved:**
```bash
curl "http://localhost:3004/trade-calls?limit=10" \
  -H "x-api-key: dev-api-key-change-in-prod" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for tc in data['data']:
    if tc.get('instrument') == 'RELIANCE' and tc.get('channel_id') == 'update-test':
        print('=== Current values ===')
        print('initial_sl:', tc['initial_sl'])
        print('targets:', tc['targets'])
        print()
        print('=== update_history ===')
        for i, snap in enumerate(tc.get('update_history', [])):
            print(f'Snapshot {i+1}:')
            print('  old initial_sl:', snap.get('initial_sl'))
            print('  old targets:', snap.get('targets'))
            print('  updated_at:', snap.get('updated_at'))
"
```

**Expected output:**
```
=== Current values ===
initial_sl: 2800
targets: [2970, 3080, 3200]

=== update_history ===
Snapshot 1:
  old initial_sl: 2780
  old targets: [2950, 3050]
  updated_at: 2026-10-18T08:xx:xx.xxxZ
```

---

## Test 5C — Multiple SL/TP updates (history accumulates)

Each time the influencer revises the signal, a new snapshot is added to `update_history`. This gives you a complete audit trail.

**Post 3 updates in sequence:**
```bash
# Signal 1 — original
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{
    "raw_text": "HDFC BUY 1700 SL 1650 TGT 1760",
    "source_channel": "multi-update-test",
    "sender_id": "influencer-001"
  }'

sleep 10

# Signal 2 — first revision (use quoted_text to give LLM full context)
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{
    "raw_text": "SL revised to 1660 TGT 1770 1800",
    "quoted_text": "HDFC BUY 1700 SL 1650 TGT 1760",
    "source_channel": "multi-update-test",
    "sender_id": "influencer-001"
  }'

sleep 10

# Signal 3 — second revision
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{
    "raw_text": "Final targets HDFC 1790 1820 1860 SL trail 1675",
    "quoted_text": "HDFC BUY 1700 SL 1660 TGT 1770 1800",
    "source_channel": "multi-update-test",
    "sender_id": "influencer-001"
  }'

sleep 10
```

**Verify 2 history snapshots exist:**
```bash
curl "http://localhost:3004/trade-calls?limit=10" \
  -H "x-api-key: dev-api-key-change-in-prod" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for tc in data['data']:
    if tc.get('instrument') == 'HDFC' and tc.get('channel_id') == 'multi-update-test':
        hist = tc.get('update_history', [])
        print(f'update_history has {len(hist)} snapshots')
        for i, snap in enumerate(hist):
            print(f'--- Snapshot {i+1} ---')
            print('  sl:', snap.get('initial_sl'), '→ targets:', snap.get('targets'))
            print('  at:', snap.get('updated_at'))
        print()
        print('Current: sl:', tc['initial_sl'], '→ targets:', tc['targets'])
"
```

**Expected output:**
```
update_history has 2 snapshots
--- Snapshot 1 ---
  sl: 1650 → targets: [1760]
  at: 2026-10-18T...
--- Snapshot 2 ---
  sl: 1660 → targets: [1770, 1800]
  at: 2026-10-18T...

Current: sl: 1675 → targets: [1790, 1820, 1860]
```

---

## Test 5D — Duplicate prevention (same message sent twice)

Ensures the dedup layer blocks the exact same message from creating two trade calls.

```bash
MSG='{"raw_text":"TCS BUY 4100 SL 4000 TGT 4250","source_channel":"dedup-test","sender_id":"influencer-001"}'

# Send once
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d "$MSG"

# Send again immediately (simulates Telegram retry)
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d "$MSG"
```

**Expected result:**
- First request → `{ "success": true }` → trade call created
- Second request → `{ "success": true, "message": "Duplicate message skipped" }` (or similar)
- Only **one** TCS trade call appears on the dashboard — no duplicate

**Check logs:**
```bash
docker-compose logs channel-connector-service | grep -i "duplicate"
```

---

## Test 6 — Hinglish signal

**Send on Telegram:**
```
RELIANCE mein buy karo 2850 pe, SL 2780, target 2950
```

**Expected result:**
- ✅ Parsed correctly despite Hindi/English mix
- Instrument: `RELIANCE`, Direction: `BUY`
- Entry: `2,850` · SL: `2,780` · Target: `2,950`
- Status: `ACTIVE`

---

## Test 7 — Forwarded message

**Send on Telegram:**
```
Forwarded message: 📌 NIFTY BUY 24500 SL 24200 TGT 24800
```

**Expected result:**
- ✅ Prefix stripped, signal parsed correctly
- OR → goes to **Review Queue** for manual review if parser is uncertain about direction

---

## Test 8 — Market price signal (no entry)

**Send on Telegram:**
```
HDFC BUY CMP SL 1580 TGT 1650 1700
```

**Expected result:**
- ⚠️ Goes to **Review Queue** — entry price is missing (CMP = current market price, unknown)
- Promote manually with the actual entry price

---

## Test 9 — Not a signal (should be ignored)

**Send on Telegram:**
```
Good morning everyone! Markets looking good today.
```

**Expected result:**
- 🚫 Nothing appears in dashboard
- Message is silently discarded by the parser
- No entry in Trade Calls or Review Queue

---

## Test 10 — Commodity signal

**Send on Telegram:**
```
CRUDE OIL MCX SHORT 8500 SL 8700 TGT 8300 8100
```

**Expected result:**
- ✅ Appears in **Trade Calls**
- Instrument: `CRUDE OIL`, Segment: `COMMODITY`, Direction: `SELL`
- Entry: `8,500` · SL: `8,700` · Targets: `8,300` · `8,100`
- Status: `ACTIVE`

---

## Review Queue — what to do with partial signals

When a signal lands in Review Queue:

1. Go to http://localhost:3000/review
2. Find the card — it shows extracted fields (colored chips) and missing fields (amber chips)
3. Click **Promote** → a form opens pre-filled with what was parsed
4. Fill in the missing values (e.g. SL, targets)
5. Click **Confirm** → signal moves to Trade Calls as `ACTIVE`

Or click **Reject** to discard it.

---

## Signal Tester (no Telegram needed)

You can test the parser directly without sending a Telegram message:

1. Go to http://localhost:3000/tester
2. Type or paste any signal text
3. Click **Parse →**
4. Result shows instantly — green (parsed), amber (needs review), grey (not a signal)

This is useful for testing edge cases without cluttering the Trade Calls list.

---

## Quick API test (terminal)

You can also inject a message directly via the test endpoint:

```bash
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{"raw_text": "BUY INFY 1600 SL 1520 TGT 1680 1760 1840"}'
```

This bypasses Telegram entirely and pushes straight into the pipeline.

**Optional fields on the test endpoint:**

| Field | Purpose | Example |
|---|---|---|
| `raw_text` | The signal message | `"NIFTY BUY 24500 SL 24200 TGT 24700"` |
| `quoted_text` | Simulates a Telegram reply context (prepended as `[QUOTE]`) | `"NIFTY BUY 24500 SL 24200"` |
| `source_channel` | Channel ID for dedup and update matching | `"test-channel"` |
| `sender_id` | Sender ID for sequential stitching | `"influencer-001"` |

---

## What to check in a Trade Call document

After any test, a full trade call document in MongoDB looks like this (key fields):

```json
{
  "_id": "6ad47e53...",
  "instrument": "NIFTY",
  "direction": "BUY",
  "entry_price": 24500,
  "initial_sl": 24200,
  "current_sl": 24200,
  "targets": [24700, 24900, 25100],
  "status": "ACTIVE",

  "parsed_data": {
    "instrument": "NIFTY",
    "segment": "F_AND_O",
    "direction": "BUY",
    "entry_price": 24500,
    "stop_loss": 24200,
    "targets": [24700, 24900, 25100],
    "target_split": [33, 34, 33],
    "trailing_sl": false,
    "confidence": 0.97,
    "missing_fields": [],
    "model_version": "ollama/llama3.2",
    "parsed_at": "2026-10-18T08:07:42Z"
  },

  "update_history": [
    {
      "initial_sl": 24200,
      "targets": [24700],
      "confidence": 0.95,
      "updated_at": "2026-10-18T09:10:00Z"
    }
  ]
}
```

- **`parsed_data`** — Full raw JSON the LLM extracted. Always present on new signals. `null` on older pre-feature records.
- **`update_history`** — One entry per update. Empty `[]` on first creation. Grows with each revision by the influencer. Read oldest-first to trace the full revision history.

---

*CAI · Testing Guide · October 2026*
