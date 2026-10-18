import { NextRequest } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const TRADE_CALL_URL = process.env.TRADE_CALL_URL!
const API_KEY = process.env.API_KEY!

export async function GET(_req: NextRequest) {
  // Proxy the SSE stream from the trade-call service.
  // Edge runtime keeps this alive as long as the client is connected.
  const upstream = await fetch(`${TRADE_CALL_URL}/api/v1/events`, {
    headers: {
      'x-api-key': API_KEY,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })

  if (!upstream.ok) {
    return new Response('SSE upstream unavailable', { status: 503 })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}
