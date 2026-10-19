'use client'
import { useEffect } from 'react'
import { mutate } from 'swr'

/**
 * Opens a single SSE connection and calls SWR's global mutate() whenever
 * the server pushes a trade-call update.
 *
 * First fetches /api/sse-config to get the direct Render URL, then connects
 * to that URL — bypassing Vercel Edge Function's 30s timeout on the Hobby plan.
 */
export function useRealtimeUpdates() {
  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout>
    let es: EventSource
    let cancelled = false

    async function connect() {
      // Resolve the SSE URL from the server (uses existing TRADE_CALL_URL env var)
      let sseUrl = '/api/events' // fallback for local dev
      try {
        const res = await fetch('/api/sse-config')
        if (res.ok) {
          const json = await res.json() as { url: string }
          sseUrl = json.url
        }
      } catch {
        // keep fallback
      }
      if (cancelled) return

      es = new EventSource(sseUrl)

      es.onmessage = () => {
        // Revalidate all trade-call-related SWR keys at once
        void mutate(
          (key: unknown) =>
            typeof key === 'string' &&
            (key.startsWith('/api/trade-calls') ||
              key.startsWith('/api/stats') ||
              key.startsWith('/api/review')),
        )
      }

      // Named event types from the SSE stream also trigger refresh
      const refresh = () => {
        void mutate(
          (key: unknown) =>
            typeof key === 'string' &&
            (key.startsWith('/api/trade-calls') ||
              key.startsWith('/api/stats') ||
              key.startsWith('/api/review')),
        )
      }
      es.addEventListener('trade_call_created', refresh)
      es.addEventListener('trade_call_updated', refresh)
      es.addEventListener('trade_call_activated', refresh)

      es.onerror = () => {
        // EventSource reconnects automatically, but we add a small delay
        // after persistent failures to avoid hammering the server.
        es.close()
        retryTimeout = setTimeout(connect, 5000)
      }
    }

    void connect()

    return () => {
      cancelled = true
      clearTimeout(retryTimeout)
      es?.close()
    }
  }, [])
}
