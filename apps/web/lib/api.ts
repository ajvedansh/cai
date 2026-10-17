import type { TradeCall, TradeCallStatus, ReviewItem, Stats, ParseResult, Segment, Direction } from './types'

const fetcher = (url: string) => fetch(url).then(r => r.json())
export { fetcher }

export async function getStats(): Promise<{ success: boolean; data: Stats }> {
  const r = await fetch('/api/stats')
  return r.json()
}

export async function getTradeCalls(params?: {
  status?: string; segment?: string; instrument?: string; page?: number; limit?: number
}): Promise<{ success: boolean; data: TradeCall[]; meta: { total: number; page: number; limit: number } }> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.segment) qs.set('segment', params.segment)
  if (params?.instrument) qs.set('instrument', params.instrument)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  const r = await fetch(`/api/trade-calls?${qs}`)
  return r.json()
}

export async function getTradeCall(id: string): Promise<{ success: boolean; data: TradeCall }> {
  const r = await fetch(`/api/trade-calls/${id}`)
  return r.json()
}

export async function updateTradeCallStatus(
  id: string, status: TradeCallStatus, review_note?: string
): Promise<{ success: boolean; data: TradeCall }> {
  const r = await fetch(`/api/trade-calls/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, review_note }),
  })
  return r.json()
}

export async function activateTradeCall(id: string): Promise<{ success: boolean; data: TradeCall }> {
  const r = await fetch(`/api/trade-calls/${id}/activate`, { method: 'POST' })
  return r.json()
}

export async function getReviewQueue(status?: string): Promise<{ success: boolean; data: ReviewItem[] }> {
  const qs = status ? `?status=${status}` : ''
  const r = await fetch(`/api/review${qs}`)
  return r.json()
}

export async function promoteReviewItem(
  id: string,
  fields: {
    instrument: string; segment: Segment; direction: Direction
    entry_price: number; stop_loss: number; targets: number[]
    target_split?: number[]; trailing_sl?: boolean
  }
): Promise<{ success: boolean; data: TradeCall }> {
  const r = await fetch(`/api/review/${id}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return r.json()
}

export async function rejectReviewItem(id: string): Promise<{ success: boolean; data: ReviewItem }> {
  const r = await fetch(`/api/review/${id}/reject`, { method: 'POST' })
  return r.json()
}

export async function parseSignal(raw_text: string, quoted_text?: string): Promise<ParseResult> {
  const r = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text, quoted_text }),
  })
  return r.json()
}
