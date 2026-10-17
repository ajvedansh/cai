# Connecting Real Channels — WhatsApp & Telegram

> How to receive real messages from WhatsApp and Telegram groups/channels into CAI on your local machine during development.

---

## Current setup (already configured)

| What | Value |
|---|---|
| **ngrok permanent domain** | `https://banked-rewind-hypnotist.ngrok-free.dev` |
| **Telegram bot** | `@cai_dev_signal_bot` |
| **Telegram webhook** | `https://banked-rewind-hypnotist.ngrok-free.dev/webhooks/telegram` |
| **Webhook secret** | `cai-dev-secret-123` |

To start developing, just run ngrok (one command) and the Docker stack. Everything else is already registered.

---

## How it works

Both WhatsApp and Telegram deliver messages by calling a **webhook URL** — an HTTPS endpoint on your server. Your local machine is not reachable from the internet by default, so ngrok creates a permanent public tunnel to port 3002.

```
WhatsApp / Telegram
       │
       │  POST https://banked-rewind-hypnotist.ngrok-free.dev/webhooks/telegram
       ▼
   ngrok tunnel  →  localhost:3002  (channel-connector-service)
       │
       ▼
   MongoDB (raw_messages)  →  Redis stream  →  signal-parser  →  trade-call-service  →  Dashboard
```

---

## Every day: how to start the full stack

**Step 1 — Start Docker services:**
```bash
cd /path/to/cai
docker-compose up -d
```

**Step 2 — Start ngrok with the permanent domain:**
```bash
ngrok http --url=banked-rewind-hypnotist.ngrok-free.dev 3002
```

That's it. Send a message to `@cai_dev_signal_bot` on Telegram and it will appear in the dashboard at http://localhost:3000.

---

## One-time setup steps (already done — for reference)

These steps were completed once. You do NOT need to repeat them unless you reset the environment.

### Step 1 — Install ngrok

```bash
brew install ngrok
```

### Step 2 — Authenticate ngrok

Sign up at https://ngrok.com → copy your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken

```bash
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

### Step 3 — Claim your free permanent domain

1. Go to https://dashboard.ngrok.com/domains
2. Click **New Domain** — ngrok gives you one free permanent domain like `something.ngrok-free.dev`
3. From now on always start ngrok with `--url=your-domain.ngrok-free.dev` — the URL never changes

### Step 4 — Create a Telegram bot

1. Open Telegram → search **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g. `CAI Dev Bot`) and username ending in `bot` (e.g. `cai_dev_signal_bot`)
4. BotFather gives you a **Bot Token** like `8597673179:AAFo-BWThKz...`
5. Save this token

### Step 5 — Register the Telegram webhook (one-time per bot)

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://banked-rewind-hypnotist.ngrok-free.dev/webhooks/telegram",
    "secret_token": "cai-dev-secret-123",
    "allowed_updates": ["message", "channel_post"]
  }'
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

Verify it was registered:
```bash
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo" | python3 -m json.tool
```

### Step 6 — Set env variables

Edit `apps/channel-connector-service/.env.docker`:

```env
TELEGRAM_BOT_TOKEN=8597673179:AAFo-BWThKz...   # your full bot token from BotFather
TELEGRAM_WEBHOOK_SECRET=cai-dev-secret-123      # must match secret_token in setWebhook
```

### Step 7 — Force-recreate the container to load new env vars

> ⚠️ `docker-compose restart` does NOT reload env files — always use `--force-recreate` after changing `.env.docker`

```bash
docker-compose up -d --force-recreate channel-connector-service
```

Verify the env vars are inside the container:
```bash
docker exec cai-channel-connector env | grep TELEGRAM
```

---

## Part A — Telegram

### A1. Create a bot via @BotFather

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g. `CAI Dev Bot`) and a username (must end in `bot`, e.g. `cai_dev_signal_bot`)
4. BotFather replies with your **Bot Token** — looks like `7123456789:AABCdef...`
5. Save this token — you will need it in env variables and to register the webhook

### A2. Choose your bot's mode — group vs channel

**Option A — Group bot** (recommended for development):
- Create a new Telegram group
- Add your bot to the group
- Promote it to Admin (so it can read all messages)
- Messages sent in the group will be delivered to your webhook

**Option B — Channel bot**:
- Create a Telegram channel
- Add your bot as an Administrator
- Posts to the channel will be delivered to your webhook

### A3. Register the webhook with Telegram

Telegram needs to know your public URL. Call this API once (replace `<BOT_TOKEN>` and `<NGROK_URL>`):

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "<NGROK_URL>/webhooks/telegram",
    "secret_token": "cai-dev-secret-123",
    "allowed_updates": ["message", "channel_post"]
  }'
```

Expected response:
```json
{ "ok": true, "result": true, "description": "Webhook was set" }
```

**Verify the webhook is registered:**
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

### A4. Set env variables

Edit `apps/channel-connector-service/.env.docker`:

```env
TELEGRAM_BOT_TOKEN=7123456789:AABCdef...      # from BotFather
TELEGRAM_WEBHOOK_SECRET=cai-dev-secret-123    # same value you passed to setWebhook above
```

Restart the channel-connector service to pick up the new values:

```bash
docker-compose restart channel-connector-service
```

### A5. Test Telegram

1. Send any message in the group/channel where your bot is an admin
2. Check the channel-connector logs:

```bash
docker-compose logs -f channel-connector-service
```

You should see log lines like:
```
[WebhooksController] Telegram webhook received
[QueuePublisher] Published message.received to Redis stream
```

3. Check the raw message appeared in MongoDB — open http://localhost:8081 → `channel_db` → `raw_messages`

4. Within a few seconds, a trade call or review queue item should appear in the dashboard at http://localhost:3000

### A6. How the Telegram adapter works (what gets parsed)

The adapter handles:
- **Group messages** — regular text from any group member
- **Channel posts** — posts from a channel your bot is an admin of
- **Reply chains** — if someone quotes a message and adds targets, both parts are joined as `[QUOTE]: … [REPLY]: …` so the parser sees the complete signal
- **Forwarded messages** — forwarded posts from other channels are extracted automatically

Messages with no text (stickers, polls, etc.) are silently ignored.

---

## Part B — WhatsApp

WhatsApp uses the **Meta Cloud API** (free, no hardware required). You register a phone number with Meta and receive messages via a webhook.

### B1. Create a Meta App

1. Go to https://developers.facebook.com
2. Click **My Apps → Create App**
3. Select **Business** as the app type
4. Give it a name (e.g. `CAI Dev`)
5. Once created, on the left sidebar: **Add Product → WhatsApp → Set Up**

### B2. Get a test phone number

Meta provides a **free test phone number** for development:

1. In your app dashboard, go to **WhatsApp → API Setup**
2. You will see a **From** field — Meta assigns a test number (e.g. `+1 555 123 4567`)
3. Note the **Phone Number ID** (a long number like `123456789012345`) — you need this later
4. You can add up to 5 **recipient test numbers** — add your own WhatsApp number to receive messages

> For production, you add a real business phone number. For development the Meta test number is sufficient.

### B3. Get your credentials

From **WhatsApp → API Setup** in your Meta app:

| Credential | Where to find |
|---|---|
| **Temporary Access Token** | Shown on the API Setup page — valid 24 h, re-generate daily during dev |
| **Phone Number ID** | Shown next to your From number |
| **App Secret** | App Settings → Basic → App Secret (click Show) |
| **Verify Token** | You invent this yourself — any string, e.g. `cai-dev-verify-token-2026` |

### B4. Register the webhook with Meta

1. In your Meta App, go to **WhatsApp → Configuration**
2. Under **Webhook**, click **Edit**
3. Enter:
   - **Callback URL:** `https://<NGROK_URL>/webhooks/whatsapp`
   - **Verify Token:** the string you chose in B3 (e.g. `cai-dev-verify-token-2026`)
4. Click **Verify and Save**

What happens: Meta calls `GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` — the channel-connector responds with the challenge automatically if `WHATSAPP_VERIFY_TOKEN` matches.

5. After saving, click **Subscribe** next to the **messages** field to start receiving message events

### B5. Set env variables

Edit `apps/channel-connector-service/.env.docker`:

```env
WHATSAPP_VERIFY_TOKEN=cai-dev-verify-token-2026    # the string you chose in B3/B4
WHATSAPP_APP_SECRET=abc123def456...                 # from App Settings → Basic
```

Restart the channel-connector:

```bash
docker-compose restart channel-connector-service
```

### B6. Send a test message

In Meta's **WhatsApp → API Setup**, use the **Send Message** panel:
- Select your test phone number as the recipient
- Click **Send Message**
- A template message arrives on your phone's WhatsApp

To test inbound (your phone → API):
- WhatsApp your test number from your personal phone (your number must be in the 5-recipient allowlist)
- Send any trade signal text

### B7. Verify it worked

```bash
docker-compose logs -f channel-connector-service
```

Look for:
```
[WebhooksController] WhatsApp webhook received
[WhatsAppAdapter] Parsed incoming message
[QueuePublisher] Published message.received to Redis stream
```

Then check http://localhost:3000 — the signal should appear in Trade Calls or Review Queue within seconds.

### B8. HMAC signature verification

The service verifies the `x-hub-signature-256` header Meta sends with every webhook call. This is why `WHATSAPP_APP_SECRET` is required. If signatures mismatch you will see `401 Invalid WhatsApp HMAC signature` in the logs — double-check that `WHATSAPP_APP_SECRET` matches the App Secret from Meta exactly.

---

## Summary — env variables to set

All changes go in `apps/channel-connector-service/.env.docker`. After editing, restart the service with `docker-compose restart channel-connector-service`.

```env
# ── Telegram ──────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=7123456789:AABCdef...
TELEGRAM_WEBHOOK_SECRET=cai-dev-secret-123

# ── WhatsApp ──────────────────────────────────────────────────────
WHATSAPP_VERIFY_TOKEN=cai-dev-verify-token-2026
WHATSAPP_APP_SECRET=your-meta-app-secret-here
```

---

## Webhook endpoint reference

| Platform | Method | Path | Auth |
|---|---|---|---|
| Telegram | POST | `/webhooks/telegram` | `x-telegram-bot-api-secret-token` header |
| WhatsApp verification | GET | `/webhooks/whatsapp` | `hub.verify_token` query param |
| WhatsApp messages | POST | `/webhooks/whatsapp` | `x-hub-signature-256` HMAC header |
| Test (no platform) | POST | `/webhooks/test` | `x-api-key` header |

Full Swagger UI: http://localhost:3002/api/docs

---

## Troubleshooting

**ngrok tunnel not reachable:**
- Ensure Docker stack is running: `docker-compose ps`
- Ensure ngrok is running on port 3002: `ngrok http 3002`
- Test locally first: `curl http://localhost:3002/health`

**Telegram webhook not receiving messages:**
```bash
# Check what Telegram has registered
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"

# Re-register if the ngrok URL changed
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d '{"url":"https://new-ngrok-url.ngrok-free.app/webhooks/telegram","secret_token":"cai-dev-secret-123","allowed_updates":["message","channel_post"]}'
```

Make sure the bot is an **Admin** of the group/channel — bots only receive messages in groups where they are admins (Privacy mode is on by default for new bots).

To disable Privacy mode so the bot reads all group messages:
```
BotFather → /mybots → your bot → Bot Settings → Group Privacy → Turn off
```

**WhatsApp webhook verification failing:**
- Check `WHATSAPP_VERIFY_TOKEN` in `.env.docker` matches exactly what you typed in the Meta console
- Check the connector is running: `docker-compose logs channel-connector-service | tail -20`
- The GET endpoint returns the `hub.challenge` value — Meta expects that exact string back

**WhatsApp `401 Invalid HMAC signature`:**
- `WHATSAPP_APP_SECRET` is wrong — go to Meta App → Settings → Basic → re-copy App Secret
- Make sure there are no trailing spaces or newlines in the env value

**ngrok URL changed after restart:**
- This should NOT happen with the permanent domain setup
- Always start ngrok with: `ngrok http --url=banked-rewind-hypnotist.ngrok-free.dev 3002`
- If you accidentally started without `--url`, just kill ngrok (`pkill ngrok`) and restart with the flag — no webhook re-registration needed since the URL is the same

---

*CAI · Channel Setup Guide · October 2026*
