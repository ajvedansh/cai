// Returns the SSE endpoint URL so the browser can connect directly to Render,
// bypassing Vercel Edge Function's 30-second timeout limit on the Hobby plan.
// Uses the existing server-side TRADE_CALL_URL env var — no new env var needed.
export async function GET() {
  const tradeCallUrl = process.env.TRADE_CALL_URL ?? 'http://localhost:3004'
  return Response.json({ url: `${tradeCallUrl}/api/v1/events` })
}
