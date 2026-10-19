import { NextRequest, NextResponse } from 'next/server'

const SIGNAL_PARSER_URL = process.env.SIGNAL_PARSER_URL ?? ''
const CHANNEL_CONNECTOR_URL = process.env.CHANNEL_CONNECTOR_URL ?? ''
const API_KEY = process.env.API_KEY ?? ''

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawText: string = body.raw_text
    const sourceChannel: string = body.source_channel ?? 'web-tester'

    // Step 1: Direct parse preview — returns result to the UI immediately
    const previewRes = await fetch(`${SIGNAL_PARSER_URL}/api/v1/parse/test`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: rawText, source_channel: sourceChannel }),
    })
    const parseData = await previewRes.json()

    // Step 2: Push through the full pipeline so trade-call-service saves to DB.
    // Must be awaited — Vercel terminates the function after response, killing
    // any fire-and-forget fetch before a cold Render service can respond.
    if (parseData.success || parseData.needs_review) {
      if (!CHANNEL_CONNECTOR_URL) {
        console.error('[parse] CHANNEL_CONNECTOR_URL is not set — trade call will NOT be saved')
        return NextResponse.json({
          ...parseData,
          pipeline_warning: 'CHANNEL_CONNECTOR_URL not configured. Signal parsed but not saved to DB.',
        })
      }

      try {
        const pipelineRes = await fetch(`${CHANNEL_CONNECTOR_URL}/webhooks/test`, {
          method: 'POST',
          headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: rawText, source_channel: sourceChannel }),
          signal: AbortSignal.timeout(15000), // 15 s — allows Render cold-start to wake
        })
        if (!pipelineRes.ok) {
          const errText = await pipelineRes.text().catch(() => pipelineRes.status.toString())
          console.error(`[parse] channel-connector returned ${pipelineRes.status}: ${errText}`)
          return NextResponse.json({
            ...parseData,
            pipeline_warning: `Signal parsed but pipeline rejected it (${pipelineRes.status}). Check channel-connector logs.`,
          })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[parse] channel-connector unreachable:', msg)
        return NextResponse.json({
          ...parseData,
          pipeline_warning: `Signal parsed but could not reach channel-connector: ${msg}`,
        })
      }
    }

    return NextResponse.json(parseData)
  } catch {
    return NextResponse.json({ success: false, error: 'Parser unavailable' }, { status: 503 })
  }
}
