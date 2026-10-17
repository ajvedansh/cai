'use client'
import { useState, useRef, useEffect } from 'react'
import { parseSignal } from '@/lib/api'
import type { ParseResult } from '@/lib/types'
import clsx from 'clsx'

const EXAMPLES = [
  'BUY INFY @ 1600. SL below 1520. TP1=1680, TP2=1760, TP3=1840. Equity NSE',
  'CRUDE OIL MCX SHORT 8500 SL 8700 TGT 8300 8100',
  '🔥 NIFTY BUY 24500 🎯 24700 24900 25100 🛑 24300',
  'Aaj RELIANCE mein buy karo 2850 pe, SL 2780, target 2950 aur 3050',
  'Forwarded message: 📌 BANKNIFTY SHORT 48500 SL 48800 T1 48200 T2 48000',
  'TCS BUY 3.5k SL 3.4k TGT 3.7k 3.9k',
  'BANKNIFTY 49000 CE BUY @ 380 SL 420 T1 310 T2 260 trailing',
  'Nifty opens flat as global markets show mixed signals. RBI policy next week.',
]

interface Message {
  id: string
  type: 'input' | 'result'
  text?: string
  result?: ParseResult
  timestamp: Date
}

function ResultCard({ result }: { result: ParseResult }) {
  const tc = result.data
  if (!result.data && !result.needs_review) {
    return (
      <div className="bg-bg-tertiary rounded-xl p-4 border border-slate-700">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <span className="text-lg">○</span>
          <span>Not a trade signal · silently discarded</span>
        </div>
        {result.reason && <div className="mt-1 text-xs text-slate-600 font-mono">{result.reason}</div>}
      </div>
    )
  }
  if (result.needs_review && tc) {
    return (
      <div className="bg-amber/5 rounded-xl p-4 border border-amber/20">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber text-sm font-semibold">⊞ Needs Review</span>
          <span className="badge badge-pending">{Math.round(result.confidence * 100)}%</span>
        </div>
        <div className="text-xs text-amber/70 mb-3">{result.reason}</div>
        <ParsedFields tc={tc} />
      </div>
    )
  }
  if (result.success && tc) {
    return (
      <div className="bg-green/5 rounded-xl p-4 border border-green/20">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-green text-sm font-semibold">✓ Trade Signal Parsed</span>
          <span className="badge badge-active">{Math.round(result.confidence * 100)}%</span>
        </div>
        <ParsedFields tc={tc} />
      </div>
    )
  }
  return (
    <div className="bg-red/5 rounded-xl p-4 border border-red/20">
      <div className="text-red text-sm">Parse failed</div>
    </div>
  )
}

function ParsedFields({ tc }: { tc: NonNullable<ParseResult['data']> }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="font-mono text-sm font-bold text-white">{tc.instrument}</span>
        <span className={clsx('badge', tc.direction === 'BUY' ? 'badge-buy' : 'badge-sell')}>
          {tc.direction === 'BUY' ? '▲' : '▼'} {tc.direction}
        </span>
        <span className="badge badge-equity">{tc.segment}</span>
        {tc.trailing_sl && <span className="badge badge-active">Trail SL</span>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg-primary rounded-lg p-2.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Entry</div>
          <div className="font-mono text-sm text-white mt-0.5">
            {tc.entry_price ? tc.entry_price.toLocaleString('en-IN') : <span className="text-amber">—</span>}
          </div>
        </div>
        <div className="bg-bg-primary rounded-lg p-2.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Stop Loss</div>
          <div className="font-mono text-sm text-red mt-0.5">
            {tc.stop_loss ? tc.stop_loss.toLocaleString('en-IN') : <span className="text-amber">—</span>}
          </div>
        </div>
        <div className="bg-bg-primary rounded-lg p-2.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Confidence</div>
          <div className="font-mono text-sm text-indigo mt-0.5">{Math.round(tc.confidence * 100)}%</div>
        </div>
      </div>
      {tc.targets.length > 0 && (
        <div className="flex gap-2">
          {tc.targets.map((t, i) => (
            <div key={i} className="bg-bg-primary rounded-lg px-2.5 py-1.5">
              <div className="text-[9px] text-slate-500 uppercase">T{i + 1}</div>
              <div className="font-mono text-xs text-green">{t.toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
      )}
      {tc.missing_fields.length > 0 && (
        <div className="text-[11px] text-amber">
          Missing: {tc.missing_fields.join(', ')}
        </div>
      )}
    </div>
  )
}

export default function TesterPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg) return
    setInput('')
    const id = Date.now().toString()
    setMessages(prev => [...prev, { id, type: 'input', text: msg, timestamp: new Date() }])
    setLoading(true)
    try {
      const result = await parseSignal(msg)
      setMessages(prev => [...prev, { id: id + '-r', type: 'result', result, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, {
        id: id + '-r', type: 'result',
        result: { success: false, needs_review: false, reason: 'Network error', confidence: 0, data: null },
        timestamp: new Date()
      }])
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4 flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-white">Signal Tester</h1>
          <p className="text-sm text-slate-500">Test raw trade signal messages through the parser</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 bg-bg-secondary border border-border rounded-lg"
          >
            Clear
          </button>
        )}
      </div>

      {/* Examples */}
      {messages.length === 0 && (
        <div className="bg-bg-secondary border border-border rounded-xl p-5 shrink-0">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Example Signals</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => send(ex)}
                className="text-left font-mono text-xs text-slate-400 bg-bg-tertiary hover:bg-bg-hover hover:text-slate-200 rounded-lg px-3 py-2 transition-colors line-clamp-2"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {messages.map(msg => (
          <div key={msg.id} className={clsx('animate-fadeIn', msg.type === 'input' ? 'flex justify-end' : '')}>
            {msg.type === 'input' && (
              <div className="max-w-[85%] bg-indigo/20 border border-indigo/30 rounded-xl px-4 py-3">
                <div className="font-mono text-sm text-slate-200 leading-relaxed">{msg.text}</div>
              </div>
            )}
            {msg.type === 'result' && msg.result && (
              <div className="max-w-[90%]">
                <ResultCard result={msg.result} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-slate-500 animate-pulse-soft">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo" />
            <div className="w-1.5 h-1.5 rounded-full bg-indigo" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-indigo" style={{ animationDelay: '0.4s' }} />
            <span className="text-xs ml-1">Parsing…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-bg-secondary border border-border rounded-xl p-3 shrink-0 flex gap-2">
        <textarea
          className="flex-1 bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo/50 resize-none font-mono"
          placeholder="Paste a trade signal message… e.g. BUY RELIANCE 2850 SL 2780 TGT 2920"
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-indigo/20 border border-indigo/30 text-indigo text-sm font-medium rounded-lg hover:bg-indigo/30 disabled:opacity-40 transition-colors self-end"
        >
          Parse →
        </button>
      </div>
    </div>
  )
}
