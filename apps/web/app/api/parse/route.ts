import { NextRequest, NextResponse } from 'next/server'

const SIGNAL_PARSER_URL = process.env.SIGNAL_PARSER_URL!
const API_KEY = process.env.API_KEY!

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${SIGNAL_PARSER_URL}/api/v1/parse/test`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: body.raw_text, source_channel: 'web-tester' }),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ success: false, error: 'Parser unavailable' }, { status: 503 })
  }
}
