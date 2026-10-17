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

## Test 5 — Reply chain (two-part signal)

**Step 1 — Send first message on Telegram:**
```
INFY BUY 1600
```

**Step 2 — Reply to that exact message with:**
```
SL 1520 TGT 1680 1760 1840
```

**Expected result:**
- ✅ Both parts joined automatically by the system
- Appears in **Trade Calls** with full details: Entry `1,600` · SL `1,520` · 3 targets
- Status: `ACTIVE`

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

---

*CAI · Testing Guide · October 2026*
