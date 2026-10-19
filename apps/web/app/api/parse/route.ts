import { NextRequest, NextResponse } from 'next/server'

const SIGNAL_PARSER_URL = process.env.SIGNAL_PARSER_URL ?? ''
const CHANNEL_CONNECTOR_URL = process.env.CHANNEL_CONNECTOR_URL ?? ''
const API_KEY = process.env.API_KEY ?? ''

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

    // Step 2: Push through the full pipeline so trade-call-service saves to DB.
    // If CHANNEL_CONNECTOR_URL is missing, surface it in the response instead of
    // silently swallowing the error.
    if (parseData.success || parseData.needs_review) {
      if (!CHANNEL_CONNECTOR_URL) {
        console.error('[parse] CHANNEL_CONNECTOR_URL env var is not set — trade call will NOT be saved to DB')
        return NextResponse.json({
          ...parseData,
          pipeline_warning: 'CHANNEL_CONNECTOR_URL is not configured on this deployment. Signal was parsed but NOT saved to the database.',
        })
      }

      fetch(`${CHANNEL_CONNECTOR_URL}/webhooks/test`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText, source_channel: sourceChannel }),
      }).catch((err: unknown) => {
        console.error('[parse] Failed to push to channel-connector pipeline:', err)
      })
    }

    return NextResponse.json(parseData)
  } catch {
    return NextResponse.json({ success: false, error: 'Parser unavailable' }, { status: 503 })
  }
}
