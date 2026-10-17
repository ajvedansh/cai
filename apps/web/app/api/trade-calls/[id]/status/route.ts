import { NextRequest, NextResponse } from 'next/server'

const TRADE_CALL_URL = process.env.TRADE_CALL_URL!
const API_KEY = process.env.API_KEY!

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const res = await fetch(`${TRADE_CALL_URL}/trade-calls/${params.id}/status`, {
      method: 'PATCH',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Backend unavailable' }, { status: 503 })
  }
}
