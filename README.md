# CAI — Channel AI Intelligence

> Automated trade signal ingestion, AI parsing, and virtual execution from social media channels.

## Architecture Overview

```
WhatsApp / Telegram
        │
        ▼
┌─────────────────────────┐
│  channel-connector-svc  │  Port 3002  (NestJS / TypeScript)
│  Saves raw messages     │
│  Publishes to Redis     │
└──────────┬──────────────┘
           │ Redis Stream: cai:message.received
           ▼
┌─────────────────────────┐
│  signal-parser-svc      │  Port 3003  (FastAPI / Python)
│  Claude AI extraction   │
│  Stateless transformer  │
└──────────┬──────────────┘
           │ Redis Stream: cai:trade_call.created
           ▼
┌─────────────────────────┐
│  trade-call-svc         │  Port 3004  (NestJS / TypeScript)
│  Saves structured calls │
│  State machine + API    │
└─────────────────────────┘
```

## Services

| Service | Port | Language | DB | URL |
|---|---|---|---|---|
| **web (Dashboard)** | **3000** | **Next.js / TypeScript** | — | **http://localhost:3000** |
| channel-connector-service | 3002 | NestJS/TypeScript | MongoDB `channel_db` | http://localhost:3002/api/docs |
| signal-parser-service | 3003 | FastAPI/Python | None (stateless) | http://localhost:3003/api/docs |
| trade-call-service | 3004 | NestJS/TypeScript | MongoDB `trade_call_db` | http://localhost:3004/api/docs |
| **Mongo Express (DB Browser)** | **8081** | Web UI | All databases | **http://localhost:8081** |

Infrastructure: **MongoDB 7** (port 27017) · **Redis 7** (port 6379)

### DB Browser Login
Open http://localhost:8081 → username: `admin` / password: `admin123`
- **`channel_db → raw_messages`** — Raw ingested messages (before AI parsing)
- **`trade_call_db → trade_calls`** — Structured, AI-parsed trade signals
- **`trade_call_db → review_queue`** — Messages that need manual review

### LLM Provider (configurable)
The signal-parser works with either a **free local model** or **Claude (paid)**:

| Mode | Setting | When to use |
|---|---|---|
| **Ollama (default)** | `USE_ANTHROPIC=false` | Free, runs on your machine — install Ollama + `ollama pull llama3.2` |
| **Anthropic Claude** | `USE_ANTHROPIC=true` + `ANTHROPIC_API_KEY=sk-ant-...` | Production, better accuracy |

To switch to Claude: edit `apps/signal-parser-service/.env.docker`, set `USE_ANTHROPIC=true` and add your key, then `docker-compose up -d signal-parser-service`.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | 4.x+ | https://docs.docker.com/desktop/ |
| Docker Compose | v2+ | Included with Docker Desktop |
| Node.js | 20.x | https://nodejs.org |
| pnpm | 9.x | `npm install -g pnpm` |
| Python | 3.12 | https://python.org |

---

## Quick Start (Docker — Recommended)

### 1. Clone & configure environment

```bash
cd /path/to/cai

# Copy env files for each service
cp apps/channel-connector-service/.env.example apps/channel-connector-service/.env.docker
cp apps/signal-parser-service/.env.example apps/signal-parser-service/.env.docker
cp apps/trade-call-service/.env.example apps/trade-call-service/.env.docker
```

### 2. Add your Anthropic API key

Edit `apps/signal-parser-service/.env.docker`:
```
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

### 3. Start everything

```bash
docker-compose up --build
```

This starts: MongoDB, Redis, channel-connector, signal-parser, trade-call services.

### 4. Verify all services are up

```bash
# Check service health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health

# Expected: { "status": "ok", ... }
```

### 5. Open Swagger UIs

- **Channel Connector:** http://localhost:3002/api/docs
- **Signal Parser:** http://localhost:3003/api/docs
- **Trade Call:** http://localhost:3004/api/docs

---

## Docker Commands

### Start the entire stack (backend + frontend)

Builds images on first run (or when code changes) and starts all services in the foreground:

```bash
docker-compose up --build
```

Run in the background (detached mode) — logs stay quiet, services keep running after you close the terminal:

```bash
docker-compose up --build -d
```

Services started: MongoDB, Redis, Mongo Express, channel-connector, signal-parser, trade-call, **web dashboard**.

Once up, open:
- **Dashboard:** http://localhost:3000
- **DB Browser:** http://localhost:8081 (admin / admin123)

---

### Stop all services

Stop and remove containers (data volumes are preserved):

```bash
docker-compose down
```

Stop, remove containers **and wipe all data** (MongoDB + Redis volumes deleted — fresh start):

```bash
docker-compose down -v
```

---

### Start or restart a single service

Use the service name from `docker-compose.yml`. Available names:

| Service name | What it is |
|---|---|
| `web` | Next.js dashboard (port 3000) |
| `channel-connector-service` | Webhook ingestion (port 3002) |
| `signal-parser-service` | AI parser (port 3003) |
| `trade-call-service` | Trade call storage (port 3004) |
| `mongo-express` | DB browser UI (port 8081) |
| `mongodb` | MongoDB database |
| `redis` | Redis streams |

**Start a single service** (infra must already be running):

```bash
docker-compose up web
docker-compose up signal-parser-service
docker-compose up trade-call-service
```

**Rebuild and restart one service** (after code changes):

```bash
docker-compose up --build web
docker-compose up --build signal-parser-service
```

**Restart a running service** (no rebuild):

```bash
docker-compose restart web
docker-compose restart trade-call-service
```

**Stop a single service** (leave everything else running):

```bash
docker-compose stop web
docker-compose stop signal-parser-service
```

---

### View logs

All services at once:

```bash
docker-compose logs -f
```

Single service (follow mode):

```bash
docker-compose logs -f web
docker-compose logs -f signal-parser-service
docker-compose logs -f trade-call-service
```

---

### Check service status

```bash
docker-compose ps
```

Sample output when everything is healthy:

```
NAME                     STATUS          PORTS
cai-channel-connector    running         0.0.0.0:3002->3002/tcp
cai-mongo-express        running         0.0.0.0:8081->8081/tcp
cai-mongodb              running         0.0.0.0:27017->27017/tcp
cai-redis                running         0.0.0.0:6379->6379/tcp
cai-signal-parser        running         0.0.0.0:3003->3003/tcp
cai-trade-call           running         0.0.0.0:3004->3004/tcp
cai-web                  running         0.0.0.0:3000->3000/tcp
```

---

## Local Development (without Docker)

### Step 1 — Start infrastructure only

```bash
docker-compose up mongodb redis -d
```

### Step 2 — Install Node.js dependencies

```bash
pnpm install
```

### Step 3 — Copy and configure local env files

```bash
# channel-connector-service
cp apps/channel-connector-service/.env.example apps/channel-connector-service/.env
# Edit: uses localhost:27017 and localhost:6379 (already set)

# signal-parser-service
cp apps/signal-parser-service/.env.example apps/signal-parser-service/.env
# REQUIRED: set ANTHROPIC_API_KEY in this file

# trade-call-service
cp apps/trade-call-service/.env.example apps/trade-call-service/.env
```

### Step 4 — Start each service in separate terminals

**Terminal 1 — channel-connector-service:**
```bash
cd apps/channel-connector-service
pnpm dev
# → http://localhost:3002
```

**Terminal 2 — signal-parser-service:**
```bash
cd apps/signal-parser-service
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3003
# → http://localhost:3003
```

**Terminal 3 — trade-call-service:**
```bash
cd apps/trade-call-service
pnpm dev
# → http://localhost:3004
```

---

## Testing the Full Pipeline

### Option A — Send a test message via the test webhook

No Telegram or WhatsApp account needed. The channel-connector service exposes a `/webhooks/test` endpoint.

```bash
curl -X POST http://localhost:3002/webhooks/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{
    "raw_text": "BUY INFY @ 1600. SL below 1520. TP1=1680, TP2=1760, TP3=1840. Equity.",
    "source_channel": "test-channel-001",
    "sender_id": "influencer-001"
  }'
```

**What happens:**
1. channel-connector saves the raw message to MongoDB → Redis Stream
2. signal-parser picks it from Redis, calls Claude API, extracts fields
3. trade-call-service picks the parsed call, saves as TradeCall with status ACTIVE

**Check the result in trade-call-service:**
```bash
curl http://localhost:3004/trade-calls \
  -H "x-api-key: dev-api-key-change-in-prod"
```

### Option B — Test the parser directly

```bash
curl -X POST http://localhost:3003/api/v1/parse/test \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -d '{
    "raw_text": "GOLD MCX BUY @ 60000. SL: 59000. Targets: 61500, 63000. Commodity.",
    "source_channel": "mcx-signals",
    "raw_message_id": "test-001"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "instrument": "GOLD",
    "segment": "COMMODITY",
    "direction": "BUY",
    "entry_price": 60000,
    "stop_loss": 59000,
    "targets": [61500, 63000],
    "target_split": [50, 50],
    "trailing_sl": false,
    "confidence": 0.96
  },
  "needs_review": false,
  "model_version": "claude-3-5-haiku-20241022"
}
```

### Option C — Test via Swagger UI

Open http://localhost:3002/api/docs and use the "Authorize" button to set header `x-api-key: dev-api-key-change-in-prod`, then call endpoints interactively.

---

## Running Tests

### signal-parser-service (Python)

```bash
cd apps/signal-parser-service
source .venv/bin/activate
pytest -v
```

### channel-connector-service (NestJS)

```bash
cd apps/channel-connector-service
pnpm test
```

### trade-call-service (NestJS)

```bash
cd apps/trade-call-service
pnpm test
```

---

## API Reference Summary

### channel-connector-service (Port 3002)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/webhooks/telegram` | Public | Telegram webhook receiver |
| GET | `/webhooks/whatsapp` | Public | WhatsApp webhook verification |
| POST | `/webhooks/whatsapp` | Public | WhatsApp webhook receiver |
| POST | `/webhooks/test` | API Key | **Test endpoint** — send any text |
| GET | `/raw-messages` | API Key | List raw messages (paginated) |
| GET | `/raw-messages/:id` | API Key | Get single raw message |
| GET | `/channel-registry` | API Key | List monitored channels |
| POST | `/channel-registry` | API Key | Add a channel |
| PATCH | `/channel-registry/:id/toggle` | API Key | Activate/deactivate channel |
| GET | `/health` | Public | Health check |

### signal-parser-service (Port 3003)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/parse/test` | API Key | **Test parse** — skip queue |
| GET | `/api/v1/parse/queue-status` | API Key | Redis stream lengths |
| GET | `/health` | Public | Health check |
| GET | `/health/ready` | Public | Readiness check (Redis connected?) |

### trade-call-service (Port 3004)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/trade-calls` | API Key | List trade calls (filtered, paginated) |
| GET | `/trade-calls/stats` | API Key | Count by status and segment |
| GET | `/trade-calls/:id` | API Key | Get single trade call |
| PATCH | `/trade-calls/:id/status` | API Key | Update status |
| POST | `/trade-calls/:id/activate` | API Key | Promote PENDING → ACTIVE |
| GET | `/review-queue` | API Key | List flagged messages |
| GET | `/review-queue/:id` | API Key | Get review item |
| POST | `/review-queue/:id/promote` | API Key | Manually promote with fields |
| POST | `/review-queue/:id/reject` | API Key | Reject review item |
| GET | `/health` | Public | Health check |

---

## Authentication

All protected endpoints require the `x-api-key` header:

```
x-api-key: dev-api-key-change-in-prod
```

Change this value in each service's `.env` file for production. The key is set identically across all services.

---

## Environment Variables

### channel-connector-service

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3002` | HTTP port |
| `MONGODB_URI` | — | MongoDB connection string |
| `REDIS_URL` | — | Redis connection URL |
| `API_KEY` | — | Internal API key |
| `TELEGRAM_BOT_TOKEN` | — | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | — | Random secret for webhook verification |
| `WHATSAPP_VERIFY_TOKEN` | — | Meta Business dashboard token |
| `WHATSAPP_APP_SECRET` | — | Meta App secret for HMAC |

### signal-parser-service

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3003` | HTTP port |
| `REDIS_URL` | — | Redis connection URL |
| `ANTHROPIC_API_KEY` | — | From console.anthropic.com |
| `ANTHROPIC_MODEL` | `claude-3-5-haiku-20241022` | Model for parsing |
| `CONFIDENCE_THRESHOLD` | `0.85` | Below this → needs_review |

### trade-call-service

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3004` | HTTP port |
| `MONGODB_URI` | — | MongoDB connection string |
| `REDIS_URL` | — | Redis connection URL |
| `API_KEY` | — | Internal API key |

---

## Troubleshooting

**Services can't connect to MongoDB:**
```bash
# Check MongoDB is running
docker-compose ps mongodb
docker-compose logs mongodb
```

**signal-parser-service not consuming messages:**
```bash
# Check consumer group exists
docker-compose exec redis redis-cli -a cai_redis_local XINFO GROUPS cai:message.received

# Check stream length
docker-compose exec redis redis-cli -a cai_redis_local XLEN cai:message.received
```

**Claude API errors:**
- Verify `ANTHROPIC_API_KEY` is set in signal-parser `.env.docker`
- Check logs: `docker-compose logs signal-parser-service`

**Port already in use:**
```bash
lsof -ti:3002 | xargs kill -9
lsof -ti:3003 | xargs kill -9
lsof -ti:3004 | xargs kill -9
```

**Reset everything (wipe data):**
```bash
docker-compose down -v   # removes volumes (all MongoDB + Redis data)
docker-compose up --build
```

---

## Redis Stream Monitoring

```bash
# View latest messages in ingestion stream
docker-compose exec redis redis-cli -a cai_redis_local \
  XREVRANGE cai:message.received + - COUNT 5

# View parsed trade calls stream
docker-compose exec redis redis-cli -a cai_redis_local \
  XREVRANGE cai:trade_call.created + - COUNT 5

# View consumer group lag
docker-compose exec redis redis-cli -a cai_redis_local \
  XINFO GROUPS cai:message.received
```

---

## Project Structure

```
cai/
├── apps/
│   ├── channel-connector-service/   NestJS — EPIC-1
│   ├── signal-parser-service/       FastAPI/Python — EPIC-2 (AI)
│   ├── trade-call-service/          NestJS — EPIC-2 (storage)
│   └── web/                         Next.js 14 PWA dashboard (port 3000)
│       ├── app/                     App Router pages & API proxy routes
│       ├── components/              Sidebar, Badge, shared UI
│       ├── lib/                     API client, TypeScript types
│       └── public/sw.js             PWA service worker
├── libs/
│   ├── types/                       Shared TypeScript types
│   └── events/                      Shared event payload types
├── infra/
│   └── mongo-init.js                DB + index initialisation
├── docker-compose.yml
├── BRD.md
├── TECHNICAL_ARCHITECTURE.md
├── IMPLEMENTATION.md
└── README.md
```

---

*CAI · v1.0.0 · October 2026*
