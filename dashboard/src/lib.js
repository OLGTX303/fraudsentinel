import { useEffect, useRef, useState, useCallback } from 'react'

// In dev, Vite proxies /api and /ws to localhost:8000. In production the
// dashboard is served by the same FastAPI service, so use the page origin.
const WS_PROTO = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
export const WS_URL = import.meta.env.PROD
  ? `${WS_PROTO}//${window.location.host}/ws`
  : `ws://${window.location.hostname}:8000/ws`

export function authToken() {
  try { return JSON.parse(localStorage.getItem('fs_user') || 'null')?.token || '' }
  catch { return '' }
}

function authHeaders(extra = {}) {
  const t = authToken()
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra
}

export async function getJSON(path) {
  const r = await fetch(`/api${path}`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.json()
}

export async function postJSON(path, body) {
  const r = await fetch(`/api${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body || {}),
  })
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.json()
}

// Stream the chatbot's SSE answer, calling onDelta(text) for each chunk.
export async function streamChat({ message, transactionId }, onDelta) {
  const t = authToken()
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify({ message, transaction_id: transactionId || null }),
  })
  if (!r.ok || !r.body) throw new Error(`chat → ${r.status}`)
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 2)
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (data === '[DONE]') return
        try { const j = JSON.parse(data); if (j.delta) onDelta(j.delta) } catch {}
      }
    }
  }
}

export const PAYMENT = {
  card:       { label: 'Credit card', icon: 'card' },
  apple_pay:  { label: 'Apple Pay',   icon: 'wallet' },
  google_pay: { label: 'Google Pay',  icon: 'wallet' },
  paypal:     { label: 'PayPal',      icon: 'wallet' },
}

export const IP_TYPE = {
  residential: { label: 'Home broadband',     icon: 'wifi',     ok: true },
  business:    { label: 'Business broadband', icon: 'building', ok: true },
  datacenter:  { label: 'Datacenter / IDC',   icon: 'server',   ok: false },
  mobile:      { label: 'Mobile carrier',     icon: 'wifi',     ok: true },
  unknown:     { label: 'Unknown network',    icon: 'server',   ok: false },
}

export const cls = (...xs) => xs.filter(Boolean).join(' ')

export const fmtMoney = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtTime = (iso) => {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour12: false }) } catch { return '—' }
}

export const DECISION = {
  ALLOW: { label: 'Allow', text: 'text-allow', dot: 'bg-allow', ring: 'border-allow/40', soft: 'bg-allow/10' },
  FLAG:  { label: 'Flag',  text: 'text-flag',  dot: 'bg-flag',  ring: 'border-flag/40',  soft: 'bg-flag/10' },
  BLOCK: { label: 'Block', text: 'text-block', dot: 'bg-block', ring: 'border-block/40', soft: 'bg-block/10' },
}

export const SEVERITY = {
  CRITICAL: 'text-crit border-crit/40 bg-crit/10',
  HIGH:     'text-high border-high/40 bg-high/10',
  MEDIUM:   'text-med  border-med/40  bg-med/10',
  LOW:      'text-sub  border-line2   bg-raised',
}

// Resilient WebSocket with auto-reconnect. `onMessage` is read from a ref so
// re-renders don't tear down the socket.
export function useAgentSocket(onMessage) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const cbRef = useRef(onMessage)
  const clientId = useRef(`fs-${Date.now()}-${Math.floor(Math.random() * 1e4)}`)
  cbRef.current = onMessage

  const connect = useCallback(() => {
    try {
      const token = authToken()
      const ws = new WebSocket(`${WS_URL}/${clientId.current}?token=${encodeURIComponent(token)}`)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); setTimeout(connect, 2500) }
      ws.onerror = () => ws.close()
      ws.onmessage = (ev) => { try { cbRef.current?.(JSON.parse(ev.data)) } catch {} }
    } catch { setTimeout(connect, 2500) }
  }, [])

  useEffect(() => { connect(); return () => wsRef.current?.close() }, [connect])

  const send = useCallback((obj) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(obj)); return true }
    return false
  }, [])

  return { connected, send }
}

export const SCENARIO_TX = {
  clean:    { account_id: 'ACC-NORMAL-001',   amount: 42.50,   currency: 'USD', merchant: 'Blue Bottle Coffee',  merchant_category: 'food_beverage',      card_country: 'US', ip_address: '104.18.12.101', ip_country: 'US', device_id: 'DEV-IPHONE-AA', is_international: false, hour_of_day: 9,  payment_method: 'apple_pay' },
  fraud:    { account_id: 'ACC-FRAUD-001',     amount: 4200.00, currency: 'USD', merchant: 'ElectroMart Online',  merchant_category: 'electronics',        card_country: 'GB', ip_address: '185.220.101.45', ip_country: 'MD', device_id: 'DEV-UNKNOWN-ZZ', is_international: true,  hour_of_day: 3, card_token: '4111111111111111', payment_method: 'card' },
  drift:    { account_id: 'ACC-DRIFT-001',     amount: 1500.00, currency: 'USD', merchant: 'CryptoExchange Pro', merchant_category: 'financial_services', card_country: 'US', ip_address: '91.108.56.100', ip_country: 'RU', device_id: 'DEV-ANDROID-YY', is_international: true,  hour_of_day: 2,  payment_method: 'google_pay' },
  escalate: { account_id: 'ACC-ESCALATE-001',  amount: 8500.00, currency: 'USD', merchant: "Sotheby's Auction",  merchant_category: 'luxury_goods',       card_country: 'US', ip_address: '98.139.180.149', ip_country: 'US', device_id: 'DEV-IPHONE-EE', is_international: true,  hour_of_day: 14, payment_method: 'paypal' },
}

export const SCENARIO_INFO = {
  clean:    { label: 'Clean payment',    desc: '$42 coffee, domestic card',            tone: 'text-allow' },
  fraud:    { label: 'Fraud attempt',    desc: '$4,200 card/IP mismatch, threat IP',   tone: 'text-block' },
  drift:    { label: 'Drift burst',      desc: 'Novel high-risk pattern → Arize alert', tone: 'text-brand' },
  escalate: { label: 'Escalation case',  desc: '$8,500 high-value, ambiguous',         tone: 'text-flag' },
}
