'use client'
import { useEffect } from 'react'
import { mutate } from 'swr'

// Connect directly to the Render service to avoid Vercel Edge Function's 30s timeout.
// Falls back to the local Vercel proxy (/api/events) in dev when the env var is absent.
const SSE_URL = process.env.NEXT_PUBLIC_TRADE_CALL_URL
  ? `${process.env.NEXT_PUBLIC_TRADE_CALL_URL}/api/v1/events`
  : '/api/events'

/**
 * Opens a single SSE connection and calls SWR's global mutate() whenever
 * the server pushes a trade-call update.
 */
export function useRealtimeUpdates() {
  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout>
    let es: EventSource

    function connect() {
      es = new EventSource(SSE_URL)

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

    connect()

    return () => {
      clearTimeout(retryTimeout)
      es?.close()
    }
  }, [])
}
