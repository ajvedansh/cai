'use client'
import { useEffect } from 'react'
import { mutate } from 'swr'

/**
 * Opens a single SSE connection to /api/events and calls SWR's global
 * mutate() whenever the server pushes a trade-call update.
 * All keys matching the pattern are re-fetched simultaneously.
 */
export function useRealtimeUpdates() {
  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout>
    let es: EventSource

    function connect() {
      es = new EventSource('/api/events')

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
