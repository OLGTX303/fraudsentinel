import { useState, useEffect, useRef, useCallback } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { Icon } from './icons.jsx'
import { cls, getJSON, useAgentSocket } from './lib.js'
import { Console, Cases, TraceView, Analytics, ChatWidget } from './views.jsx'
import { useAuth, LoginView, initials } from './auth.jsx'
import { useTheme } from './theme.js'

gsap.registerPlugin(useGSAP)

const NAV = [
  { id: 'console',   label: 'Console',   icon: 'pulse',  sub: 'Live investigation' },
  { id: 'cases',     label: 'Cases',     icon: 'layers', sub: 'Review queue' },
  { id: 'trace',     label: 'Trace',     icon: 'radar',  sub: 'Arize spans' },
  { id: 'analytics', label: 'Analytics', icon: 'bars',   sub: 'Metrics & drift' },
]
const TITLES = {
  console:   ['Investigation console', 'Fire transactions and watch the agent reason in real time'],
  cases:     ['Case queue', 'Every investigation, reviewable with human-in-the-loop override'],
  trace:     ['Observability', 'OpenInference trace exported to Arize for every decision'],
  analytics: ['Analytics', 'Decision mix, latency, risk distribution and model drift'],
}

export default function App() {
  const auth = useAuth()
  if (!auth.user) return <LoginView onAuth={auth.signIn} />
  return <AppShell auth={auth} />
}

function AppShell({ auth }) {
  const { user, signOut } = auth
  const theme = useTheme()
  const [view, setView] = useState('console')
  const [traceId, setTraceId] = useState(null)
  const [steps, setSteps] = useState([])
  const [running, setRunning] = useState(false)
  const [latest, setLatest] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [cases, setCases] = useState([])
  const [health, setHealth] = useState({ model: '…', demo_mode: true })
  const [notice, setNotice] = useState('')
  const stepsRef = useRef([])
  const appRef = useRef(null)

  const refreshMetrics = useCallback(() => { getJSON('/metrics').then(setMetrics).catch(() => {}) }, [])
  const refreshCases = useCallback(() => { getJSON('/cases?limit=200').then(d => setCases(d.cases)).catch(() => {}) }, [])

  const onMessage = useCallback((msg) => {
    const { type, payload } = msg
    if (type === 'investigation_start') { stepsRef.current = []; setSteps([]); setRunning(true) }
    if (['tool_call', 'tool_result', 'reasoning', 'decision'].includes(type)) {
      stepsRef.current = [...stepsRef.current, { type, payload, id: Date.now() + Math.random() }]
      setSteps([...stepsRef.current])
    }
    if (type === 'complete') { setRunning(false); setLatest(payload); refreshMetrics(); refreshCases() }
    if (type === 'error') { setRunning(false); setNotice(payload?.message || 'Request blocked.') }
  }, [refreshMetrics, refreshCases])

  const { connected, send } = useAgentSocket(onMessage)

  useEffect(() => {
    getJSON('/health').then(setHealth).catch(() => {})
    refreshMetrics(); refreshCases()
    const id = setInterval(refreshMetrics, 5000)
    return () => clearInterval(id)
  }, [refreshMetrics, refreshCases])

  const openTrace = useCallback((id) => { setTraceId(id); setView('trace') }, [])

  // Auto-dismiss the rate-limit/error toast
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 6000)
    return () => clearTimeout(t)
  }, [notice])

  // Page entrance
  useGSAP(() => {
    gsap.from('.fs-rail', { autoAlpha: 0, x: -20, duration: 0.5, ease: 'power3.out' })
    gsap.from('.fs-top > *', { autoAlpha: 0, y: -12, stagger: 0.06, duration: 0.45, delay: 0.1 })
  }, { scope: appRef })

  // Animate view content swap
  const viewRef = useRef(null)
  useGSAP(() => {
    gsap.fromTo(viewRef.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' })
  }, { dependencies: [view], scope: appRef })

  const ctx = { connected, running, steps, latest, metrics, cases, send, refreshMetrics, refreshCases, openTrace, traceId }
  const [title, subtitle] = TITLES[view]

  return (
    <div ref={appRef} className="h-full flex bp-radial">
      {/* ── Sidebar rail ───────────────────────────────────────── */}
      <aside className="fs-rail w-[210px] shrink-0 border-r border-line bg-surface/80 hidden md:flex flex-col">
        <div className="px-4 py-4 flex items-center gap-2.5 border-b border-line">
          <span className="relative grid place-items-center w-8 h-8 rounded-lg bg-brand/15 border border-brand/30 text-brand">
            <Icon name="shield" size={18} />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight grad-text">FraudSentinel</div>
            <div className="text-[10px] text-muted">Gemini · Arize · GCP</div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map(n => {
            const active = view === n.id
            return (
              <button key={n.id} onClick={() => setView(n.id)}
                className={cls('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors relative',
                  active ? 'bg-raised text-txt' : 'text-sub hover:text-txt hover:bg-raised/50')}>
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand" />}
                <Icon name={n.icon} size={16} className={active ? 'text-brand' : ''} />
                <div className="leading-tight">
                  <div className="text-sm font-medium">{n.label}</div>
                  <div className="text-[10px] text-muted">{n.sub}</div>
                </div>
              </button>
            )
          })}
        </nav>

        <div className="p-3 border-t border-line space-y-2.5">
          <div className="flex items-center gap-2 text-[10px]">
            <span className={cls('relative flex w-2 h-2')}>
              <span className={cls('absolute inline-flex h-full w-full rounded-full', connected ? 'bg-allow/60 animate-ping2' : '')} />
              <span className={cls('relative inline-flex rounded-full h-2 w-2', connected ? 'bg-allow' : 'bg-muted')} />
            </span>
            <span className={connected ? 'text-allow' : 'text-muted'}>{connected ? 'Agent online' : 'Reconnecting…'}</span>
            <span className="ml-auto text-muted font-mono truncate">{health.model}</span>
          </div>
          {/* Signed-in user */}
          <div className="flex items-center gap-2.5 pt-1">
            <span className="grid place-items-center w-7 h-7 rounded-full bg-brand/15 border border-brand/30 text-brand text-[10px] font-semibold shrink-0">
              {initials(user.name || user.email)}
            </span>
            <div className="leading-tight min-w-0 flex-1">
              <div className="text-xs font-medium text-txt truncate">{user.name}</div>
              <div className="text-[10px] text-muted truncate">{user.role}</div>
            </div>
            <button onClick={signOut} title="Sign out" aria-label="Sign out"
              className="text-muted hover:text-block transition-colors p-1 rounded-md hover:bg-raised">
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col bp-grid">
        {/* Mobile top nav (sidebar is hidden < md) */}
        <div className="md:hidden flex items-center gap-1 px-3 h-12 border-b border-line bg-surface/85 backdrop-blur overflow-x-auto no-scrollbar">
          <span className="flex items-center gap-1.5 mr-1 shrink-0">
            <Icon name="shield" size={16} className="text-brand" />
            <span className="text-sm font-semibold grad-text">FraudSentinel</span>
          </span>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={cls('shrink-0 px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 transition-colors',
                view === n.id ? 'bg-raised text-brand' : 'text-sub hover:text-txt')}>
              <Icon name={n.icon} size={14} />{n.label}
            </button>
          ))}
          <button onClick={signOut} aria-label="Sign out" className="ml-auto shrink-0 text-muted hover:text-block p-1">
            <Icon name="x" size={15} />
          </button>
        </div>

        <header className="fs-top flex items-center gap-4 px-4 md:px-6 h-14 md:h-16 border-b border-line bg-surface/60 backdrop-blur">
          <div>
            <h1 className="text-base font-semibold tracking-tight">{title}</h1>
            <p className="text-2xs text-muted">{subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={theme.cycle} title={`Theme: ${theme.mode}${theme.info ? ' · ' + theme.info : ''}`}
              aria-label="Toggle theme"
              className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-line2 text-2xs text-sub hover:text-txt hover:border-brand/40 transition-colors">
              <Icon name={theme.mode === 'auto' ? 'sunset' : theme.resolved === 'light' ? 'sun' : 'moon'} size={13} />
              <span className="capitalize">{theme.mode}</span>
            </button>
            {health.demo_mode && (
              <span className="px-2 py-1 rounded-md border border-line2 text-2xs text-sub">demo data</span>
            )}
            <span className="px-2 py-1 rounded-md border border-brand/30 bg-brand/5 text-2xs text-brand font-mono">{health.model}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
          <div ref={viewRef} className="max-w-6xl mx-auto">
            {view === 'console'   && <Console ctx={ctx} />}
            {view === 'cases'     && <Cases ctx={ctx} />}
            {view === 'trace'     && <TraceView ctx={ctx} />}
            {view === 'analytics' && <Analytics ctx={ctx} />}
          </div>
        </main>

        {/* IDE-style status bar */}
        <footer className="h-7 shrink-0 border-t border-line bg-ink flex items-center gap-4 px-4 text-[10px] text-muted font-mono">
          <span className={connected ? 'text-allow' : 'text-block'}>● {connected ? 'CONNECTED' : 'OFFLINE'}</span>
          <span>cases {metrics?.total ?? 0}</span>
          <span>avg {metrics?.avg_latency_ms ?? 0}ms</span>
          <span className={metrics?.drift?.status === 'alert' ? 'text-block' : ''}>drift {metrics?.drift?.status ?? '—'}</span>
          <span className="ml-auto">observability: Arize OpenInference</span>
        </footer>
      </div>

      {notice && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg border border-block/40 bg-block/15 text-block text-xs shadow-panel flex items-center gap-2 backdrop-blur">
          <Icon name="alert" size={13} /> {notice}
          <button onClick={() => setNotice('')} className="ml-2 text-muted hover:text-txt" aria-label="Dismiss"><Icon name="x" size={12} /></button>
        </div>
      )}

      <ChatWidget latest={latest} />
    </div>
  )
}
