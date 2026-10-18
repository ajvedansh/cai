import { NextRequest, NextResponse } from 'next/server'

const SIGNAL_PARSER_URL = process.env.SIGNAL_PARSER_URL!
const CHANNEL_CONNECTOR_URL = process.env.CHANNEL_CONNECTOR_URL!
const API_KEY = process.env.API_KEY!

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawText: string = body.raw_text
    const sourceChannel: string = body.source_channel ?? 'web-tester'

    // Step 1: Get instant parse preview for the UI response
    const previewRes = await fetch(`${SIGNAL_PARSER_URL}/api/v1/parse/test`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: rawText, source_channel: sourceChannel }),
    })
    const parseData = await previewRes.json()

    // Step 2: If it's a valid signal, push it through the full pipeline so the
    // trade-call service creates the TradeCall and it appears on the dashboard.
    if (parseData.success || parseData.needs_review) {
      fetch(`${CHANNEL_CONNECTOR_URL}/webhooks/test`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText, source_channel: sourceChannel }),
      }).catch(() => {
        // fire-and-forget — don't block the response if connector is slow
      })
    }

    return NextResponse.json(parseData)
  } catch {
    return NextResponse.json({ success: false, error: 'Parser unavailable' }, { status: 503 })
  }
}
