import { NextRequest, NextResponse } from 'next/server'

const TRADE_CALL_URL = process.env.TRADE_CALL_URL!
const API_KEY = process.env.API_KEY!

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${TRADE_CALL_URL}/trade-calls/${params.id}`, {
      headers: { 'x-api-key': API_KEY },
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Backend unavailable' }, { status: 503 })
  }
}
