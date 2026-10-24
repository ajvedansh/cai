import { NextRequest, NextResponse } from 'next/server'

const SIGNAL_PARSER_URL = process.env.SIGNAL_PARSER_URL ?? ''
const API_KEY = process.env.API_KEY ?? ''
// Upstash REST API — bypasses Render free-tier cold-start entirely.
// Get these from your Upstash console → Redis → REST API tab.
const UPSTASH_REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? ''
const UPSTASH_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? ''
const TRADE_CALL_STREAM = 'cai:trade_call.created'

async function publishToRedisStream(event: Record<string, unknown>): Promise<void> {
  // Upstash REST: POST / with body ["XADD", stream, "*", field, value]
  const res = await fetch(UPSTASH_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['XADD', TRADE_CALL_STREAM, '*', 'event', JSON.stringify(event)]),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status))
    throw new Error(`Upstash ${res.status}: ${text}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawText: string = body.raw_text
    const sourceChannel: string = body.source_channel ?? 'web-tester'

    // Step 1: Preview parse — returns structured data to the UI
    const previewRes = await fetch(`${SIGNAL_PARSER_URL}/api/v1/parse/test`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: rawText, source_channel: sourceChannel }),
    })
    const parseData = await previewRes.json()

    // Step 2: Publish directly to Redis stream via Upstash HTTP REST.
    // Skips channel-connector → signal-parser round-trip (both are Render free-tier
    // services that cold-start in 30-60 s, exceeding Vercel's function timeout).
    // The trade-call-service consumer on Render picks up the stream message and saves to DB.
    if (parseData.success) {
      if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) {
        console.error('[parse] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set')
        return NextResponse.json({
          ...parseData,
          pipeline_warning: 'Upstash REST credentials not configured — trade call not saved to DB.',
        })
      }

      const d = parseData.data
      const now = new Date().toISOString()
      const event = {
        event_id: crypto.randomUUID(),
        event_type: 'trade_call.created',
        produced_by: 'web-tester',
        produced_at: now,
        payload: {
          raw_message_id: `tester-${crypto.randomUUID()}`,
          source_channel: sourceChannel,
          instrument: d.instrument,
          segment: d.segment,
          direction: d.direction,
          entry_price: d.entry_price,
          stop_loss: d.stop_loss,
          targets: d.targets,
          target_split: d.target_split ?? [],
          trailing_sl: d.trailing_sl ?? false,
          risk_pct: d.risk_pct ?? null,
          confidence: d.confidence,
          model_version: parseData.model_version ?? 'unknown',
          parsed_data: { ...d, parsed_at: now },
        },
      }

      try {
        await publishToRedisStream(event)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[parse] Redis publish failed:', msg)
        return NextResponse.json({
          ...parseData,
          pipeline_warning: `Signal parsed but stream publish failed: ${msg}`,
        })
      }
    }

    return NextResponse.json(parseData)
  } catch {
    return NextResponse.json({ success: false, error: 'Parser unavailable' }, { status: 503 })
  }
}
