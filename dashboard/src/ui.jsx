import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { Icon } from './icons.jsx'
import { cls, DECISION, SEVERITY, PAYMENT, IP_TYPE, CARD_BRANDS } from './lib.js'

gsap.registerPlugin(useGSAP)
const REDUCE = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
export const dur = (s) => (REDUCE ? 0 : s)

// ── Animated count-up ─────────────────────────────────────────────
export function AnimatedNumber({ value, decimals = 0, className }) {
  const ref = useRef(null)
  const prev = useRef(0)
  const fmt = (v) => (decimals ? Number(v).toFixed(decimals) : Math.round(v).toLocaleString())
  useGSAP(() => {
    const o = { v: prev.current }
    gsap.to(o, {
      v: value ?? 0, duration: dur(0.7), ease: 'power2.out',
      onUpdate: () => { if (ref.current) ref.current.textContent = fmt(o.v) },
    })
    prev.current = value ?? 0
  }, { dependencies: [value] })
  return <span ref={ref} className={className}>{fmt(value ?? 0)}</span>
}

// ── Decision pill ─────────────────────────────────────────────────
export function DecisionPill({ decision, size = 'sm' }) {
  const d = DECISION[decision] || DECISION.FLAG
  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-2xs'
  return (
    <span className={cls('inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide uppercase',
      pad, d.text, d.ring, d.soft)}>
      <span className={cls('w-1.5 h-1.5 rounded-full', d.dot)} />
      {d.label}
    </span>
  )
}

export function SeverityTag({ severity }) {
  return (
    <span className={cls('px-1.5 py-0.5 rounded border text-2xs font-semibold tracking-wide', SEVERITY[severity])}>
      {severity}
    </span>
  )
}

export function PaymentBadge({ method }) {
  const p = PAYMENT[method] || PAYMENT.card
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-line2 bg-raised text-2xs text-sub">
      <Icon name={p.icon} size={12} /> {p.label}
    </span>
  )
}

export function CardBrandMark({ brand }) {
  if (!brand) return null
  const b = CARD_BRANDS[brand] || CARD_BRANDS.unknown
  const base = 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-line2 shadow-sm'
  if (brand === 'mastercard') return (
    <span className={base} title="Mastercard">
      <span className="relative w-6 h-4 inline-block">
        <span className="absolute left-0 top-0 w-4 h-4 rounded-full" style={{ background: '#eb001b' }} />
        <span className="absolute left-2 top-0 w-4 h-4 rounded-full opacity-90" style={{ background: '#f79e1b', mixBlendMode: 'multiply' }} />
      </span>
      <span className="text-[10px] font-bold text-[#1a1a1a] lowercase">mastercard</span>
    </span>
  )
  if (brand === 'visa') return <span className={base} title="Visa"><span className="text-sm font-extrabold italic tracking-tight text-[#1a1f71]">VISA</span></span>
  if (brand === 'amex') return <span className={cls(base, '!bg-[#2e77bc] !border-[#2e77bc]')} title="American Express"><span className="text-[10px] font-extrabold text-white tracking-widest">AMEX</span></span>
  if (brand === 'unionpay') return <span className={base} title="UnionPay"><span className="text-[11px] font-extrabold"><span className="text-[#e21836]">Union</span><span className="text-[#00447c]">Pay</span></span></span>
  if (brand === 'discover') return <span className={base} title="Discover"><span className="text-[10px] font-extrabold text-[#1a1a1a]">DISC<span className="text-[#ff6000]">VER</span></span></span>
  if (brand === 'jcb') return <span className={base} title="JCB"><span className="text-[11px] font-extrabold tracking-tight"><span className="text-[#0b4ea2]">J</span><span className="text-[#be0028]">C</span><span className="text-[#2e8b3d]">B</span></span></span>
  return <span className={cls(base, 'bg-transparent')} title={b.label}><span className="text-[10px] font-bold" style={{ color: b.color }}>{b.label}</span></span>
}

export function IpBadge({ type }) {
  const t = IP_TYPE[type] || IP_TYPE.unknown
  return (
    <span className={cls('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-2xs',
      t.ok ? 'border-allow/40 text-allow bg-allow/10' : 'border-block/40 text-block bg-block/10')}>
      <Icon name={t.icon} size={12} /> {t.label} {t.ok ? '✓' : '✗'}
    </span>
  )
}

// ── Panel + labels ────────────────────────────────────────────────
export function Panel({ className, children, ...rest }) {
  return (
    <div {...rest} className={cls('rounded-xl border border-line bg-panel shadow-panel', className)}>
      {children}
    </div>
  )
}

export function Eyebrow({ children, icon, right }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon && <span className="text-muted"><Icon name={icon} size={13} /></span>}
      <span className="eyebrow">{children}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────
export function Kpi({ label, value, decimals = 0, unit, accent = 'text-txt', spark }) {
  return (
    <Panel className="p-3.5">
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="flex items-end gap-1.5">
        <AnimatedNumber value={value} decimals={decimals} className={cls('text-2xl font-semibold tnum', accent)} />
        {unit && <span className="text-2xs text-muted mb-1">{unit}</span>}
      </div>
      {spark && <div className="mt-2"><Sparkline points={spark} /></div>}
    </Panel>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────
export function Sparkline({ points = [], width = 120, height = 28, color = '#4493f8' }) {
  if (points.length < 2) return <div style={{ height }} />
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  const d = points.map((p, i) =>
    `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(height - ((p - min) / span) * (height - 4) - 2).toFixed(1)}`).join(' ')
  const area = `${d} L${width},${height} L0,${height} Z`
  const id = `sg-${color.slice(1)}`
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ── Histogram (risk-score distribution) ───────────────────────────
export function Histogram({ bins = [], height = 120 }) {
  const max = Math.max(1, ...bins)
  const color = (i) => (i < 4 ? '#3fb950' : i < 7 ? '#f0b429' : '#f85149')
  const root = useRef(null)
  useGSAP(() => {
    gsap.from('.hbar', { scaleY: 0, transformOrigin: 'bottom', stagger: 0.03, duration: dur(0.5), ease: 'power3.out' })
  }, { scope: root, dependencies: [bins.join(',')] })
  return (
    <div ref={root} className="flex items-end gap-1.5" style={{ height }}>
      {bins.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
          <div className="hbar w-full rounded-t" title={`${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}: ${b}`}
            style={{ height: `${(b / max) * (height - 18)}px`, minHeight: b ? 3 : 0, background: color(i) }} />
          <span className="text-[9px] text-muted tnum">{(i / 10).toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Donut (decision distribution) ─────────────────────────────────
export function Donut({ data = {}, size = 132 }) {
  const order = ['ALLOW', 'FLAG', 'BLOCK']
  const colors = { ALLOW: '#3fb950', FLAG: '#4493f8', BLOCK: '#f85149' }
  const total = order.reduce((s, k) => s + (data[k] || 0), 0)
  const r = size / 2 - 10, c = 2 * Math.PI * r
  let offset = 0
  const ring = useRef(null)
  useGSAP(() => {
    gsap.from('.seg', { autoAlpha: 0, stagger: 0.08, duration: dur(0.5), ease: 'power2.out' })
  }, { scope: ring, dependencies: [total] })
  return (
    <div className="flex items-center gap-5">
      <svg ref={ring} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#141b26" strokeWidth="12" />
        {total > 0 && order.map((k) => {
          const frac = (data[k] || 0) / total
          const seg = (
            <circle key={k} className="seg" cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={colors[k]} strokeWidth="12" strokeLinecap="butt"
              strokeDasharray={`${frac * c} ${c}`} strokeDashoffset={-offset} />
          )
          offset += frac * c
          return seg
        })}
      </svg>
      <div className="space-y-1.5">
        {order.map((k) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors[k] }} />
            <span className="text-sub w-12">{DECISION[k].label}</span>
            <span className="tnum text-txt font-medium">{data[k] || 0}</span>
            <span className="tnum text-muted">{total ? Math.round(((data[k] || 0) / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Risk meter ────────────────────────────────────────────────────
export function RiskMeter({ score = 0 }) {
  const ref = useRef(null)
  const color = score < 0.4 ? '#3fb950' : score < 0.7 ? '#f0b429' : '#f85149'
  useGSAP(() => {
    gsap.fromTo(ref.current, { width: '0%' }, { width: `${score * 100}%`, duration: dur(0.9), ease: 'power2.out' })
  }, { dependencies: [score] })
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="eyebrow">Risk score</span>
        <span className="tnum text-sm font-semibold" style={{ color }}>{score.toFixed(4)}</span>
      </div>
      <div className="h-2 rounded-full bg-raised overflow-hidden">
        <div ref={ref} className="h-full rounded-full" style={{ background: color, width: 0 }} />
      </div>
    </div>
  )
}

// ── Trace waterfall ───────────────────────────────────────────────
const KIND = {
  tool_span: { kind: 'TOOL', color: '#4493f8' },
  llm_span: { kind: 'LLM', color: '#f0b429' },
  investigation_result: { kind: 'CHAIN', color: '#3fb950' },
  prompt_quality: { kind: 'EVAL', color: '#a371f7' },
  analyst_feedback: { kind: 'EVAL', color: '#a371f7' },
  drift_alert: { kind: 'ALERT', color: '#f85149' },
}
export function TraceWaterfall({ spans = [], totalMs = 0 }) {
  const root = useRef(null)
  useGSAP(() => {
    gsap.from('.span-bar', { scaleX: 0, transformOrigin: 'left', stagger: 0.05, duration: dur(0.4), ease: 'power3.out' })
  }, { scope: root, dependencies: [spans.length] })
  if (!spans.length) return <div className="text-xs text-muted py-6 text-center">No spans captured for this trace.</div>
  // Synthesize a proportional Gantt layout from span order (in-memory log has no durations).
  const weights = spans.map((s) => (s.type === 'llm_span' ? 3 : s.type === 'investigation_result' ? 1.5 : 1))
  const totalW = weights.reduce((a, b) => a + b, 0)
  let acc = 0
  const rows = spans.map((s, i) => {
    const start = (acc / totalW) * 100
    const w = (weights[i] / totalW) * 100
    acc += weights[i]
    return { s, i, start, w, ms: totalMs ? Math.round((weights[i] / totalW) * totalMs) : null }
  })
  return (
    <div ref={root} className="space-y-1.5">
      {rows.map(({ s, i, start, w, ms }) => {
        const meta = KIND[s.type] || { kind: 'SPAN', color: '#5b6776' }
        const label = s.tool || s.name || s.type
        const barW = Math.min(Math.max(w - 1.2, 3), 100 - start)  // small gap so bars never touch
        return (
          <div key={i} className="grid grid-cols-[136px_52px_1fr_46px] items-center gap-2.5 text-2xs">
            <span className="truncate font-mono text-sub" title={label}>{label}</span>
            <span className="justify-self-start px-1.5 py-0.5 rounded border text-[9px] font-semibold tracking-wide"
              style={{ color: meta.color, borderColor: meta.color + '66', background: meta.color + '14' }}>{meta.kind}</span>
            <div className="relative h-5 rounded-md bg-raised/70 border border-line/60 overflow-hidden">
              <div className="span-bar absolute top-1 h-3 rounded-sm" title={`${meta.kind} · ${label}`}
                style={{ left: `${start}%`, width: `${barW}%`, background: meta.color, boxShadow: `0 0 8px -2px ${meta.color}` }} />
            </div>
            <span className="tnum text-muted text-right">{ms != null ? `${ms}ms` : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Slide-over drawer ─────────────────────────────────────────────
export function Drawer({ open, onClose, children, width = 'max-w-xl' }) {
  const panel = useRef(null)
  const back = useRef(null)
  useGSAP(() => {
    if (open) {
      gsap.set([back.current, panel.current], { display: 'block' })
      gsap.fromTo(back.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur(0.25) })
      gsap.fromTo(panel.current, { xPercent: 100 }, { xPercent: 0, duration: dur(0.45), ease: 'power3.out' })
    } else {
      gsap.to(back.current, { autoAlpha: 0, duration: dur(0.2) })
      gsap.to(panel.current, { xPercent: 100, duration: dur(0.3), ease: 'power2.in',
        onComplete: () => gsap.set([back.current, panel.current], { display: 'none' }) })
    }
  }, { dependencies: [open] })
  // Portal to <body> so the fixed overlay is never trapped by an ancestor with
  // a CSS transform (the GSAP view transition) — which clipped it to a small box.
  if (typeof document === 'undefined') return null
  return createPortal(
    <>
      <div ref={back} onClick={onClose} style={{ display: 'none' }}
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" />
      <div ref={panel} style={{ display: 'none' }}
        className={cls('fixed right-0 top-0 z-[61] h-full w-full bg-surface border-l border-line shadow-2xl overflow-y-auto', width)}>
        {children}
      </div>
    </>,
    document.body,
  )
}

export function Empty({ icon = 'shield', title, sub }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-12 text-center">
      <div className="text-muted mx-auto mb-3 w-fit"><Icon name={icon} size={30} strokeWidth={1.3} /></div>
      <div className="text-sm text-sub">{title}</div>
      {sub && <div className="text-2xs text-muted mt-1.5">{sub}</div>}
    </div>
  )
}
