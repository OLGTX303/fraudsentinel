import { useRef, useState, useEffect, useCallback } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { Icon, toolIconName } from './icons.jsx'
import {
  cls, fmtMoney, fmtTime, getJSON, postJSON, streamChat, DECISION,
  SCENARIO_TX, SCENARIO_INFO, PAYMENT,
} from './lib.js'
import {
  Panel, Eyebrow, Kpi, DecisionPill, SeverityTag, RiskMeter, Donut, Histogram,
  Sparkline, TraceWaterfall, Drawer, Empty, AnimatedNumber, dur, PaymentBadge, IpBadge,
} from './ui.jsx'

// ── Live agent step row ───────────────────────────────────────────
function StepRow({ step }) {
  const root = useRef(null)
  const tool = step.payload?.tool
  const name = tool || step.type
  const isResult = step.type === 'tool_result'
  useGSAP(() => {
    gsap.from(root.current, { autoAlpha: 0, x: -18, duration: dur(0.4), ease: 'power3.out' })
  }, { scope: root })
  return (
    <div ref={root} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border border-line bg-raised/60">
      <span className={cls('text-sub', isResult && 'text-allow')}>
        <Icon name={toolIconName[tool] || 'pulse'} size={14} />
      </span>
      <span className="font-mono text-2xs text-txt flex-1 truncate">{name}</span>
      <span className="text-2xs text-muted">{isResult ? 'done' : step.type === 'tool_call' ? 'running' : step.type}</span>
    </div>
  )
}

// ── Feedback (human-in-the-loop) control ──────────────────────────
function FeedbackBar({ result, onDone }) {
  const [state, setState] = useState(result.analyst_override ? 'sent' : 'idle')
  const submit = async (analyst_decision) => {
    setState('sending')
    try {
      await postJSON('/feedback', {
        transaction_id: result.transaction_id, trace_id: result.trace_id, analyst_decision,
      })
      setState('sent'); onDone?.()
    } catch { setState('idle') }
  }
  if (state === 'sent') {
    return <div className="text-2xs text-allow flex items-center gap-1.5"><Icon name="check" size={13} /> Analyst feedback logged to Arize</div>
  }
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow">Analyst review</span>
      <button disabled={state === 'sending'} onClick={() => submit(result.decision)}
        className="px-2 py-1 rounded-md border border-allow/40 text-allow text-2xs hover:bg-allow/10 transition-colors flex items-center gap-1">
        <Icon name="check" size={12} /> Confirm
      </button>
      {['ALLOW', 'FLAG', 'BLOCK'].filter(d => d !== result.decision).map(d => (
        <button key={d} disabled={state === 'sending'} onClick={() => submit(d)}
          className="px-2 py-1 rounded-md border border-line2 text-sub text-2xs hover:text-txt hover:border-flag/40 transition-colors">
          Override → {DECISION[d].label}
        </button>
      ))}
    </div>
  )
}

// ── Interactive payment tester (real checkout to fire a fraud check) ──
const NETWORKS = {
  residential: { ip: '104.18.12.101', country: 'US', intl: false, label: 'Home', icon: 'wifi' },
  business:    { ip: '212.58.244.18', country: 'US', intl: false, label: 'Business', icon: 'building' },
  datacenter:  { ip: '185.220.101.45', country: 'MD', intl: true,  label: 'Datacenter', icon: 'server' },
}
const METHOD_TABS = [
  { id: 'card', label: 'Card', icon: 'card' },
  { id: 'apple_pay', label: 'Apple Pay', icon: 'wallet' },
  { id: 'google_pay', label: 'Google Pay', icon: 'wallet' },
  { id: 'paypal', label: 'PayPal', icon: 'wallet' },
]

function PaymentTester({ onRun, disabled }) {
  const [method, setMethod] = useState('card')
  const [amount, setAmount] = useState('4200.00')
  const [merchant, setMerchant] = useState('ElectroMart Online')
  const [card, setCard] = useState('4111 1111 1111 1111')
  const [exp, setExp] = useState('08/27')
  const [cvv, setCvv] = useState('123')
  const [name, setName] = useState('Alex Rivera')
  const [network, setNetwork] = useState('datacenter')

  const fmtCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ').trim()

  const pay = () => {
    if (disabled) return
    const n = NETWORKS[network]
    const digits = card.replace(/\D/g, '')
    onRun({
      account_id: 'ACC-CHECKOUT-001', amount: Number(amount) || 0, currency: 'USD',
      merchant: merchant || 'Merchant', merchant_category: 'general',
      card_country: 'US', ip_address: n.ip, ip_country: n.country,
      device_id: 'DEV-CHECKOUT-01', is_international: n.intl, hour_of_day: new Date().getHours(),
      card_token: method === 'card' ? (digits || '0000') : '0000', payment_method: method,
    }, 'checkout')
  }

  const amountNum = Number(amount) || 0
  const inputCls = 'w-full bg-ink border border-line rounded-md px-2.5 py-2 text-xs text-txt focus:border-brand/50 outline-none'

  return (
    <div className="space-y-3">
      {/* method tabs */}
      <div className="grid grid-cols-4 gap-1.5">
        {METHOD_TABS.map(t => (
          <button key={t.id} onClick={() => setMethod(t.id)}
            className={cls('flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] transition-all',
              method === t.id ? 'border-brand/50 bg-brand/10 text-txt' : 'border-line text-muted hover:text-sub hover:border-line2')}>
            <Icon name={t.icon} size={16} />{t.label}
          </button>
        ))}
      </div>

      {/* amount + merchant */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="text-2xs text-muted">Amount (USD)</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={cls(inputCls, 'mt-0.5 font-mono')} /></label>
        <label className="block"><span className="text-2xs text-muted">Merchant</span>
          <input value={merchant} onChange={e => setMerchant(e.target.value)} className={cls(inputCls, 'mt-0.5')} /></label>
      </div>

      {/* card fields */}
      {method === 'card' && (
        <div className="space-y-2 rounded-lg border border-line bg-raised/40 p-2.5">
          <label className="block"><span className="text-2xs text-muted">Card number</span>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-muted"><Icon name="card" size={14} /></span>
              <input value={card} onChange={e => setCard(fmtCard(e.target.value))} inputMode="numeric"
                className="flex-1 bg-transparent text-xs font-mono text-txt outline-none" placeholder="4111 1111 1111 1111" />
            </div>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block col-span-1"><span className="text-2xs text-muted">Expiry</span>
              <input value={exp} onChange={e => setExp(e.target.value)} className={cls(inputCls, 'mt-0.5 font-mono')} placeholder="MM/YY" /></label>
            <label className="block col-span-1"><span className="text-2xs text-muted">CVV</span>
              <input value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} className={cls(inputCls, 'mt-0.5 font-mono')} placeholder="123" /></label>
            <label className="block col-span-1"><span className="text-2xs text-muted">Name</span>
              <input value={name} onChange={e => setName(e.target.value)} className={cls(inputCls, 'mt-0.5')} /></label>
          </div>
          <div className="text-[10px] text-muted">Tip: <span className="font-mono text-sub">4111 1111 1111 1111</span> is on the threat blocklist.</div>
        </div>
      )}
      {method !== 'card' && (
        <div className="rounded-lg border border-line bg-raised/40 p-2.5 text-2xs text-sub flex items-center gap-2">
          <Icon name="lock" size={13} className="text-allow" />
          {PAYMENT[method].label} uses a device-bound token — no raw card data is shared with the merchant.
        </div>
      )}

      {/* network selector — to test the broadband-only rule */}
      <div>
        <div className="eyebrow mb-1.5">Network (test the broadband-only rule)</div>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(NETWORKS).map(([k, n]) => (
            <button key={k} onClick={() => setNetwork(k)}
              className={cls('flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[10px] transition-all',
                network === k
                  ? (k === 'datacenter' ? 'border-block/50 bg-block/10 text-block' : 'border-allow/50 bg-allow/10 text-allow')
                  : 'border-line text-muted hover:text-sub')}>
              <Icon name={n.icon} size={13} /> {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* pay button — branded per method */}
      <PayButton method={method} amount={amountNum} disabled={disabled} onClick={pay} />
    </div>
  )
}

function PayButton({ method, amount, disabled, onClick }) {
  const money = `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const base = 'w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50'
  if (method === 'apple_pay')
    return <button disabled={disabled} onClick={onClick} className={cls(base, 'bg-black text-white hover:bg-black/90')}>
      <Icon name="wallet" size={14} /> <span className="font-semibold">Apple&nbsp;Pay</span> · {money}</button>
  if (method === 'google_pay')
    return <button disabled={disabled} onClick={onClick} className={cls(base, 'bg-white text-[#3c4043] border border-line2 hover:bg-white/90')}>
      <span className="font-semibold"><span className="text-[#4285F4]">G</span>oogle&nbsp;Pay</span> · {money}</button>
  if (method === 'paypal')
    return <button disabled={disabled} onClick={onClick} className={cls(base, 'bg-[#ffc439] text-[#003087] hover:brightness-105')}>
      <span className="font-bold italic">Pay<span className="text-[#0070ba]">Pal</span></span> · {money}</button>
  return <button disabled={disabled} onClick={onClick} className={cls(base, 'bg-brand text-onbrand hover:brightness-110 shadow-glow')}>
    <Icon name="lock" size={14} /> Pay {money}</button>
}

// ══════════════════════════════════════════════════════════════════
// CONSOLE
// ══════════════════════════════════════════════════════════════════
export function Console({ ctx }) {
  const { connected, running, steps, latest, metrics, send, refreshMetrics, openTrace } = ctx
  const [scenario, setScenario] = useState('fraud')
  const [mode, setMode] = useState('scenarios')      // 'scenarios' | 'pay'
  const [auto, setAuto] = useState(false)
  const [busy, setBusy] = useState(false)
  const autoRef = useRef(null)

  const runScenario = (s) => {
    const tx = { transaction_id: `TXN-${s.toUpperCase()}-${Date.now()}`, ...SCENARIO_TX[s], timestamp: new Date().toISOString() }
    send({ type: 'investigate', scenario: s, transaction: tx })
  }
  const runCustom = (data, label) => {
    send({ type: 'investigate', scenario: label, transaction: { transaction_id: `TXN-CUSTOM-${Date.now()}`, ...data, timestamp: new Date().toISOString() } })
  }

  // Auto-stream a random scenario on an interval (demo: builds drift + volume).
  useEffect(() => {
    if (!auto) { clearInterval(autoRef.current); return }
    autoRef.current = setInterval(() => {
      const pool = ['clean', 'clean', 'fraud', 'drift', 'escalate']
      runScenario(pool[Math.floor(Math.random() * pool.length)])
    }, 2600)
    return () => clearInterval(autoRef.current)
  }, [auto]) // eslint-disable-line

  const simulateBatch = async () => {
    setBusy(true)
    try { await postJSON('/simulate', { count: 25, scenario: 'drift' }); refreshMetrics() } finally { setBusy(false) }
  }

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Controls */}
      <div className="col-span-12 lg:col-span-4 space-y-5">
        <Panel className="p-4">
          <div className="flex items-center gap-1 mb-3 p-0.5 rounded-lg bg-ink border border-line w-fit">
            {[['scenarios', 'Scenarios'], ['pay', 'Test payment']].map(([m, lbl]) => (
              <button key={m} onClick={() => setMode(m)}
                className={cls('px-3 py-1 rounded-md text-2xs font-medium transition-colors',
                  mode === m ? 'bg-raised text-txt' : 'text-muted hover:text-sub')}>{lbl}</button>
            ))}
          </div>

          {mode === 'scenarios' ? (
            <div className="space-y-2">
              {Object.keys(SCENARIO_TX).map(s => (
                <button key={s} onClick={() => setScenario(s)}
                  className={cls('w-full text-left p-2.5 rounded-lg border transition-all',
                    scenario === s ? 'border-brand/50 bg-brand/5' : 'border-line hover:border-line2 hover:bg-raised/50')}>
                  <div className={cls('text-sm font-medium', SCENARIO_INFO[s].tone)}>{SCENARIO_INFO[s].label}</div>
                  <div className="text-2xs text-muted mt-0.5">{SCENARIO_INFO[s].desc}</div>
                </button>
              ))}
              <button onClick={() => runScenario(scenario)} disabled={running || !connected}
                className={cls('w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors',
                  running || !connected ? 'bg-raised text-muted cursor-not-allowed' : 'bg-brand text-onbrand hover:brightness-110')}>
                <Icon name={running ? 'refresh' : 'play'} size={15} className={running ? 'animate-spin' : ''} />
                {running ? 'Investigating…' : 'Run investigation'}
              </button>
            </div>
          ) : (
            <PaymentTester onRun={runCustom} disabled={running || !connected} />
          )}

          <div className="hr my-3" />
          <div className="flex items-center justify-between">
            <button onClick={() => setAuto(a => !a)}
              className={cls('flex items-center gap-2 text-2xs px-2 py-1 rounded-md border transition-colors',
                auto ? 'border-block/40 text-block bg-block/5' : 'border-line2 text-sub hover:text-txt')}>
              <span className={cls('w-1.5 h-1.5 rounded-full', auto ? 'bg-block animate-pulse-slow' : 'bg-muted')} />
              {auto ? 'Stop live stream' : 'Live stream'}
            </button>
            <button onClick={simulateBatch} disabled={busy}
              className="flex items-center gap-1.5 text-2xs px-2 py-1 rounded-md border border-line2 text-sub hover:text-txt transition-colors">
              <Icon name="zap" size={12} /> {busy ? 'Running…' : 'Simulate 25 (drift)'}
            </button>
          </div>
        </Panel>

        <DriftCard drift={metrics?.drift} />

        {steps.length > 0 && (
          <Panel className="p-4">
            <Eyebrow icon="pulse" right={running && <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse-slow" />}>
              Live agent trace
            </Eyebrow>
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {steps.map(s => <StepRow key={s.id} step={s} />)}
            </div>
          </Panel>
        )}
      </div>

      {/* Latest decision */}
      <div className="col-span-12 lg:col-span-8 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Investigated" value={metrics?.total ?? 0} accent="text-txt" />
          <Kpi label="Blocked" value={metrics?.decisions?.BLOCK ?? 0} accent="text-block" />
          <Kpi label="Avg latency" value={metrics?.avg_latency_ms ?? 0} unit="ms" accent="text-allow" />
          <Kpi label="Agentic calls" value={metrics?.agentic_count ?? 0} accent="text-brand" />
        </div>

        {latest ? <LatestCard result={latest} openTrace={openTrace} refreshMetrics={refreshMetrics} />
          : <Empty icon="shield" title="Run an investigation to begin"
              sub="The agent gathers evidence, reasons with Gemini, and streams every step here in real time." />}

        {latest && <ConsoleTrace result={latest} openTrace={openTrace} />}
      </div>
    </div>
  )
}

// Arize tracer/monitor surfaced on the main demo page.
function ConsoleTrace({ result, openTrace }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!result?.trace_id) { setData(null); return }
    getJSON(`/trace/${result.trace_id}`).then(setData).catch(() => setData(null))
  }, [result?.trace_id])
  return (
    <Panel className="p-4">
      <Eyebrow icon="radar" right={
        <button onClick={() => openTrace(result.trace_id)} className="text-2xs text-sub hover:text-brand transition-colors flex items-center gap-1">
          full view <Icon name="chevronR" size={11} />
        </button>
      }>Arize live trace · {result.trace_id?.slice(0, 12)}…</Eyebrow>
      <TraceWaterfall spans={data?.spans || []} totalMs={result.processing_ms || 0} />
      <div className="mt-2.5 text-2xs text-muted flex items-center gap-1.5">
        <Icon name="link" size={11} /> Exported to Arize → project <span className="font-mono text-sub">fraudsentinel-v1</span>
      </div>
    </Panel>
  )
}

function DriftCard({ drift }) {
  const ref = useRef(null)
  const status = drift?.status || 'calibrating'
  useGSAP(() => {
    if (status === 'alert' && ref.current) {
      gsap.fromTo(ref.current, { x: -5 }, { x: 5, duration: 0.07, repeat: 7, yoyo: true,
        onComplete: () => gsap.set(ref.current, { x: 0 }) })
    }
  }, { dependencies: [status] })
  const tone = status === 'alert' ? 'border-block/50 bg-block/5' : status === 'ok' ? 'border-allow/30' : 'border-line'
  const dot = status === 'alert' ? 'text-block' : status === 'ok' ? 'text-allow' : 'text-muted'
  return (
    <Panel className={cls('p-4', tone)}>
      <div ref={ref}>
        <Eyebrow icon="radar" right={<span className={cls('text-2xs font-bold uppercase', dot)}>{status}</span>}>
          Arize drift monitor
        </Eyebrow>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">PSI</span>
          <span className="tnum text-txt">{drift?.psi?.toFixed(4) ?? '0.0000'} <span className="text-muted">/ 0.2000</span></span>
        </div>
        {drift?.recent_scores?.length > 1 && (
          <div className="mt-2"><Sparkline points={drift.recent_scores} color={status === 'alert' ? '#f85149' : '#4493f8'} height={26} /></div>
        )}
      </div>
    </Panel>
  )
}

function LatestCard({ result, openTrace, refreshMetrics }) {
  const r = result
  const root = useRef(null)
  useGSAP(() => {
    const tl = gsap.timeline()
    tl.from(root.current, { autoAlpha: 0, y: 22, duration: dur(0.5), ease: 'power3.out' })
      .from('.lc-pill', { scale: 0.4, autoAlpha: 0, duration: dur(0.5), ease: 'back.out(2)' }, '-=0.25')
      .from('.lc-sig', { autoAlpha: 0, x: -10, stagger: 0.05, duration: dur(0.35) }, '-=0.2')
  }, { scope: root, dependencies: [r.transaction_id] })

  return (
    <Panel ref={root} className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <span className="lc-pill"><DecisionPill decision={r.decision} size="lg" /></span>
        <div className="min-w-0">
          <div className="font-mono text-2xs text-muted truncate">{r.transaction_id}</div>
          <div className="text-xs text-sub">{r.merchant} · {fmtMoney(r.amount)}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cls('px-1.5 py-0.5 rounded border text-2xs font-medium',
            r.decision_method === 'agentic' ? 'border-brand/40 text-brand' : 'border-line2 text-muted')}>
            {r.decision_method === 'agentic' ? '⬡ agentic' : 'pipeline'}
          </span>
          <span className="text-2xs text-muted tnum">{r.processing_ms}ms</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5 p-4">
        <div className="space-y-4">
          <RiskMeter score={r.risk_score} />
          <div>
            <Eyebrow>Payment & network</Eyebrow>
            <div className="flex gap-2 flex-wrap">
              <PaymentBadge method={r.payment_method} />
              <IpBadge type={r.ip_connection_type} />
            </div>
          </div>
          <div>
            <Eyebrow>Agent reasoning</Eyebrow>
            <p className="text-sm text-txt/90 leading-relaxed">{r.reasoning}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ThreatTag flagged={r.threat_hits?.ip_flagged} label="IP" level={r.threat_hits?.risk_level} />
            <ThreatTag flagged={r.threat_hits?.card_flagged} label="Card" />
          </div>
        </div>
        <div className="space-y-4">
          {r.key_signals?.length > 0 && (
            <div>
              <Eyebrow>Key signals</Eyebrow>
              <ul className="space-y-1.5">
                {r.key_signals.map((s, i) => (
                  <li key={i} className="lc-sig flex items-start gap-2 text-xs text-sub">
                    <span className="text-brand mt-0.5"><Icon name="chevronR" size={12} /></span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.related_activity && (
            <div className="rounded-lg border border-line2 bg-raised/50 p-2.5">
              <div className="eyebrow mb-1 flex items-center gap-1.5"><Icon name="link" size={11} /> Agent ran deeper lookup</div>
              <div className="text-2xs text-sub leading-relaxed">{r.related_activity.note}</div>
              <div className="text-2xs text-muted mt-1 tnum">
                {r.related_activity.transactions_24h} tx / 24h · {fmtMoney(r.related_activity.total_amount_24h)}
              </div>
            </div>
          )}
          {r.rule_violations?.length > 0 && (
            <div>
              <Eyebrow>Rule violations ({r.rule_violations.length})</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {r.rule_violations.map((v, i) => <SeverityTag key={i} severity={v.severity} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {r.sar_draft && (
        <div className="px-4 pb-4">
          <Eyebrow icon="file">SAR draft (auto-generated)</Eyebrow>
          <pre className="text-2xs text-sub whitespace-pre-wrap leading-relaxed font-mono bg-ink border border-line rounded-lg p-3 max-h-44 overflow-y-auto">{r.sar_draft}</pre>
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-3 border-t border-line flex-wrap">
        <FeedbackBar result={r} onDone={refreshMetrics} />
        <button onClick={() => openTrace(r.trace_id)}
          className="ml-auto flex items-center gap-1.5 text-2xs text-sub hover:text-brand transition-colors">
          <Icon name="radar" size={13} /> Open Arize trace
        </button>
      </div>
    </Panel>
  )
}

function ThreatTag({ flagged, label, level }) {
  return (
    <span className={cls('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-2xs',
      flagged ? 'border-block/40 text-block bg-block/10' : 'border-line2 text-muted')}>
      <Icon name={flagged ? 'alert' : 'check'} size={11} />
      {label}: {flagged ? (level || 'flagged') : 'clean'}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════════
// CASES
// ══════════════════════════════════════════════════════════════════
export function Cases({ ctx }) {
  const { cases, refreshCases, openTrace } = ctx
  const [filter, setFilter] = useState('ALL')
  const [sel, setSel] = useState(null)
  const rows = (cases || []).filter(c => filter === 'ALL' || c.decision === filter)

  useEffect(() => { refreshCases() }, []) // eslint-disable-line

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <Eyebrow icon="layers">Case queue</Eyebrow>
        <div className="ml-auto flex items-center gap-1 p-0.5 rounded-lg bg-ink border border-line">
          {['ALL', 'BLOCK', 'FLAG', 'ALLOW'].map(d => (
            <button key={d} onClick={() => setFilter(d)}
              className={cls('px-2.5 py-1 rounded-md text-2xs font-medium transition-colors',
                filter === d ? 'bg-raised text-txt' : 'text-muted hover:text-sub')}>
              {d === 'ALL' ? 'All' : DECISION[d].label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? <div className="p-10"><Empty icon="list" title="No cases yet" sub="Investigations you run appear here as a reviewable queue." /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                {['Time', 'Decision', 'Account', 'Merchant', 'Amount', 'Risk', 'Method', ''].map(h => (
                  <th key={h} className="font-medium px-4 py-2 eyebrow">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.transaction_id} onClick={() => setSel(c)}
                  className="border-b border-line/60 hover:bg-raised/50 cursor-pointer transition-colors">
                  <td className="px-4 py-2.5 font-mono text-muted">{fmtTime(c.timestamp)}</td>
                  <td className="px-4 py-2.5"><DecisionPill decision={c.decision} /></td>
                  <td className="px-4 py-2.5 font-mono text-sub">{c.account_id}</td>
                  <td className="px-4 py-2.5 text-txt">{c.merchant}</td>
                  <td className="px-4 py-2.5 tnum text-sub">{fmtMoney(c.amount)}</td>
                  <td className="px-4 py-2.5 tnum" style={{ color: c.risk_score < 0.4 ? '#3fb950' : c.risk_score < 0.7 ? '#f0b429' : '#f85149' }}>{c.risk_score.toFixed(2)}</td>
                  <td className="px-4 py-2.5">{c.decision_method === 'agentic' ? <span className="text-brand">⬡</span> : <span className="text-muted">·</span>}
                    {c.analyst_override && <span className="ml-1.5 text-flag" title="Analyst override"><Icon name="userCheck" size={12} /></span>}</td>
                  <td className="px-4 py-2.5 text-muted"><Icon name="chevronR" size={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={!!sel} onClose={() => setSel(null)}>
        {sel && <CaseDetail c={sel} onClose={() => setSel(null)} openTrace={openTrace} refresh={refreshCases} />}
      </Drawer>
    </Panel>
  )
}

function CaseDetail({ c, onClose, openTrace, refresh }) {
  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-3">
        <DecisionPill decision={c.decision} size="lg" />
        <div className="min-w-0">
          <div className="font-mono text-2xs text-muted truncate">{c.transaction_id}</div>
          <div className="text-xs text-sub">{c.merchant} · {fmtMoney(c.amount)}</div>
        </div>
        <button onClick={onClose} aria-label="Close case detail" className="ml-auto text-muted hover:text-txt"><Icon name="x" size={18} /></button>
      </div>
      <RiskMeter score={c.risk_score} />
      <div className="flex gap-2 flex-wrap">
        <PaymentBadge method={c.payment_method} />
        <IpBadge type={c.ip_connection_type} />
      </div>
      <div>
        <Eyebrow>Reasoning</Eyebrow>
        <p className="text-sm text-txt/90 leading-relaxed">{c.reasoning}</p>
      </div>
      {c.key_signals?.length > 0 && (
        <div>
          <Eyebrow>Key signals</Eyebrow>
          <ul className="space-y-1.5">{c.key_signals.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-sub"><span className="text-brand mt-0.5"><Icon name="chevronR" size={12} /></span>{s}</li>
          ))}</ul>
        </div>
      )}
      {c.rule_violations?.length > 0 && (
        <div>
          <Eyebrow>Rule violations</Eyebrow>
          <div className="space-y-2">{c.rule_violations.map((v, i) => (
            <div key={i} className={cls('p-2 rounded-lg border text-2xs', 'border-line2 bg-raised/50')}>
              <div className="flex items-center gap-2 mb-1"><SeverityTag severity={v.severity} /><span className="font-mono text-muted">{v.rule_id}</span><span className="text-sub font-medium">{v.rule_name}</span></div>
              <p className="text-muted leading-relaxed">{v.description}</p>
            </div>
          ))}</div>
        </div>
      )}
      {c.sar_draft && (
        <div>
          <Eyebrow icon="file">SAR draft</Eyebrow>
          <pre className="text-2xs text-sub whitespace-pre-wrap leading-relaxed font-mono bg-ink border border-line rounded-lg p-3 max-h-56 overflow-y-auto">{c.sar_draft}</pre>
        </div>
      )}
      <div className="hr" />
      <FeedbackBar result={c} onDone={refresh} />
      <button onClick={() => { onClose(); openTrace(c.trace_id) }}
        className="flex items-center gap-1.5 text-2xs text-sub hover:text-brand transition-colors">
        <Icon name="radar" size={13} /> Open Arize trace
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// TRACE
// ══════════════════════════════════════════════════════════════════
export function TraceView({ ctx }) {
  const { cases, latest, refreshCases } = ctx
  const [sel, setSel] = useState(ctx.traceId || latest?.trace_id || null)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)

  // Always have a fresh list of cases to pick from.
  useEffect(() => { refreshCases() }, []) // eslint-disable-line
  // Follow an "Open Arize trace" click.
  useEffect(() => { if (ctx.traceId) setSel(ctx.traceId) }, [ctx.traceId])
  // Default to the most recent investigation if nothing is selected yet.
  useEffect(() => {
    if (!sel) {
      const def = latest?.trace_id || cases?.[0]?.trace_id || null
      if (def) setSel(def)
    }
  }, [cases, latest]) // eslint-disable-line

  useEffect(() => {
    if (!sel) { setData(null); return }
    setData(null); setErr(false)
    getJSON(`/trace/${sel}`).then(setData).catch(() => setErr(true))
  }, [sel])

  const list = cases || []
  const result = list.find(c => c.trace_id === sel) || (latest?.trace_id === sel ? latest : null)

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Trace selector */}
      <div className="col-span-12 lg:col-span-4">
        <Panel className="p-3">
          <Eyebrow icon="layers" right={<span className="text-2xs text-muted">{list.length}</span>}>Recent traces</Eyebrow>
          {list.length === 0
            ? <div className="text-2xs text-muted py-8 text-center">No investigations yet.<br />Run one in the Console.</div>
            : (
              <div className="space-y-1 max-h-[64vh] overflow-y-auto pr-1">
                {list.map(c => (
                  <button key={c.transaction_id} onClick={() => setSel(c.trace_id)}
                    className={cls('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors',
                      sel === c.trace_id ? 'border-brand/50 bg-brand/5' : 'border-line hover:bg-raised/50')}>
                    <DecisionPill decision={c.decision} />
                    <span className="text-2xs text-sub truncate flex-1">{c.merchant}</span>
                    <span className="text-[10px] text-muted font-mono">{fmtTime(c.timestamp)}</span>
                  </button>
                ))}
              </div>
            )}
        </Panel>
      </div>

      {/* Waterfall + summary */}
      <div className="col-span-12 lg:col-span-8 space-y-3">
        {!sel ? (
          <Empty icon="radar" title="No trace selected" sub="Run an investigation in the Console, then pick a trace on the left." />
        ) : (
          <>
            <Panel className="p-4">
              <Eyebrow icon="radar" right={<span className="font-mono text-2xs text-muted">{sel?.slice(0, 18)}…</span>}>
                Investigation trace (OpenInference / Arize)
              </Eyebrow>
              {err ? <div className="text-xs text-muted py-6 text-center">Trace not found.</div>
                : <TraceWaterfall spans={data?.spans || []} totalMs={result?.processing_ms || 0} />}
              <div className="mt-4 p-2.5 rounded-lg border border-brand/25 bg-brand/5 text-2xs text-brand flex items-center gap-2">
                <Icon name="link" size={13} /> Full waterfall, evals & drill-down in Arize → <span className="font-mono">app.arize.com</span>
              </div>
            </Panel>
            {result && (
              <Panel className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <DecisionPill decision={result.decision} size="lg" />
                  <span className="text-xs text-sub truncate">{result.merchant} · {fmtMoney(result.amount)}</span>
                </div>
                <RiskMeter score={result.risk_score} />
                <div className="text-2xs text-sub leading-relaxed">{result.reasoning}</div>
              </Panel>
            )}
            <Panel className="p-4">
              <Eyebrow>Span types</Eyebrow>
              <div className="flex flex-wrap gap-4 text-2xs">
                {[['TOOL', '#4493f8'], ['LLM', '#f0b429'], ['CHAIN', '#3fb950'], ['EVAL', '#a371f7']].map(([k, c]) => (
                  <div key={k} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} /><span className="text-sub">{k}</span></div>
                ))}
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════
export function Analytics({ ctx }) {
  const { metrics } = ctx
  const m = metrics
  if (!m || !m.total) return <Empty icon="bars" title="No data yet" sub="Run investigations (or use ‘Simulate 25’) to populate analytics." />
  const riskTimeline = (m.timeline || []).map(t => t.risk_score)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total investigated" value={m.total} />
        <Kpi label="Avg risk" value={m.avg_risk} decimals={3} accent="text-brand" />
        <Kpi label="p95 latency" value={m.p95_latency_ms} unit="ms" accent="text-flag" />
        <Kpi label="Agent agreement" value={m.feedback?.agreement_rate != null ? m.feedback.agreement_rate * 100 : 100} unit="%" accent="text-allow" />
      </div>
      <div className="grid grid-cols-12 gap-5">
        <Panel className="col-span-12 md:col-span-5 p-4">
          <Eyebrow icon="layers">Decision distribution</Eyebrow>
          <Donut data={m.decisions} />
        </Panel>
        <Panel className="col-span-12 md:col-span-7 p-4">
          <Eyebrow icon="bars">Risk-score distribution</Eyebrow>
          <Histogram bins={m.risk_histogram} />
        </Panel>
        <Panel className="col-span-12 md:col-span-7 p-4">
          <Eyebrow icon="pulse">Risk over last {riskTimeline.length} decisions</Eyebrow>
          {riskTimeline.length > 1 ? <Sparkline points={riskTimeline} height={70} color="#f0b429" /> : <div className="text-2xs text-muted py-6 text-center">More data needed.</div>}
        </Panel>
        <Panel className="col-span-12 md:col-span-5 p-4">
          <Eyebrow icon="radar">Drift & autonomy</Eyebrow>
          <div className="space-y-2.5 text-xs">
            <Row k="Drift PSI" v={`${m.drift?.psi?.toFixed(4) ?? '0.0000'} (${m.drift?.status})`} />
            <Row k="Agentic decisions" v={`${m.agentic_count} / ${m.total}`} />
            <Row k="Analyst overrides" v={m.feedback?.total ?? 0} />
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Row({ k, v }) {
  return <div className="flex items-center justify-between"><span className="text-muted">{k}</span><span className="tnum text-txt">{v}</span></div>
}

// ══════════════════════════════════════════════════════════════════
// STREAMING CHAT WIDGET (payment-check assistant)
// ══════════════════════════════════════════════════════════════════
const CHAT_CHIPS = [
  'Explain the last payment check',
  'Why this decision?',
  'Is the IP allowed?',
  'Which payment method?',
]

export function ChatWidget({ latest }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef(null)
  const panelRef = useRef(null)

  useGSAP(() => {
    if (open && panelRef.current) {
      gsap.fromTo(panelRef.current, { autoAlpha: 0, y: 16, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: dur(0.3), ease: 'power3.out' })
    }
  }, { dependencies: [open] })

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages])

  const send = async (text) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }, { role: 'bot', text: '' }])
    setBusy(true)
    try {
      await streamChat({ message: q, transactionId: latest?.transaction_id }, (delta) => {
        setMessages(m => {
          const c = [...m]; c[c.length - 1] = { role: 'bot', text: c[c.length - 1].text + delta }; return c
        })
      })
    } catch {
      setMessages(m => { const c = [...m]; c[c.length - 1] = { role: 'bot', text: '(assistant unavailable — sign in and run a check first)' }; return c })
    }
    setBusy(false)
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && messages.length === 0) send('Explain the last payment check')
  }

  return (
    <>
      <button onClick={toggle} aria-label="Payment assistant"
        className="fixed bottom-12 right-6 z-50 w-12 h-12 grid place-items-center rounded-full bg-brand text-onbrand shadow-glow hover:brightness-110 transition">
        <Icon name={open ? 'x' : 'chat'} size={20} />
      </button>

      {open && (
        <div ref={panelRef}
          className="fixed bottom-28 right-6 z-50 w-[370px] max-w-[92vw] h-[470px] flex flex-col rounded-xl border border-line bg-surface shadow-panel overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-brand/15 border border-brand/30 text-brand"><Icon name="chat" size={14} /></span>
            <div className="leading-tight">
              <div className="text-sm font-medium">Payment assistant</div>
              <div className="text-[10px] text-muted">Streams the payment-check details</div>
            </div>
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-allow animate-pulse-slow" />
          </div>

          <div ref={bodyRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.length === 0 && (
              <div className="text-2xs text-muted text-center py-6">Ask me about the latest payment check.</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={cls('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cls('max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-brand/15 border border-brand/30 text-txt'
                    : 'bg-raised border border-line text-sub')}>
                  {msg.text || <span className="text-muted">▋</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {CHAT_CHIPS.map(ch => (
              <button key={ch} onClick={() => send(ch)} disabled={busy}
                className="text-[10px] px-2 py-1 rounded-full border border-line2 text-muted hover:text-txt hover:border-brand/40 transition-colors">
                {ch}
              </button>
            ))}
          </div>

          <form onSubmit={e => { e.preventDefault(); send() }} className="flex items-center gap-2 p-3 border-t border-line">
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about this payment…"
              className="flex-1 bg-ink border border-line rounded-lg px-3 py-2 text-xs text-txt placeholder:text-muted/60 outline-none focus:border-brand/50" />
            <button type="submit" disabled={busy} aria-label="Send"
              className={cls('w-9 h-9 grid place-items-center rounded-lg transition-colors',
                busy ? 'bg-raised text-muted' : 'bg-brand text-onbrand hover:brightness-110')}>
              <Icon name={busy ? 'refresh' : 'send'} size={15} className={busy ? 'animate-spin' : ''} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
