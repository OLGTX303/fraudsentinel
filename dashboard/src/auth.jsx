import { useState, useRef, useCallback } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { Icon } from './icons.jsx'
import { cls, postJSON } from './lib.js'

gsap.registerPlugin(useGSAP)
const REDUCE = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const dur = (s) => (REDUCE ? 0 : s)

const KEY = 'fs_user'

// Session = { token, email, name, role }. The password is validated server-side
// (POST /api/login) and never stored in the browser bundle.
export function useAuth() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
  })
  const signIn = useCallback((record) => {
    localStorage.setItem(KEY, JSON.stringify(record)); setUser(record)
  }, [])
  const signOut = useCallback(() => { localStorage.removeItem(KEY); setUser(null) }, [])
  return { user, signIn, signOut }
}

export function initials(nameOrEmail = '') {
  const s = nameOrEmail.replace(/@.*/, '').replace(/[._-]+/g, ' ').trim()
  const parts = s.split(' ').filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'A'
}

const FEATURES = [
  ['cpu', 'Agentic reasoning', 'Gemini plans its own tool use and decides ALLOW / FLAG / BLOCK.'],
  ['radar', 'Full observability', 'Every step exported to Arize as an OpenInference trace.'],
  ['userCheck', 'Human-in-the-loop', 'Confirm or override — feedback trains the agent over time.'],
]

export function LoginView({ onAuth }) {
  const [email, setEmail] = useState('analyst@fraudsentinel.ai')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const root = useRef(null)

  useGSAP(() => {
    const tl = gsap.timeline()
    tl.from('.lg-brand', { autoAlpha: 0, x: -24, duration: dur(0.6), ease: 'power3.out' })
      .from('.lg-feat', { autoAlpha: 0, x: -16, stagger: 0.1, duration: dur(0.45) }, '-=0.3')
      .from('.lg-card', { autoAlpha: 0, y: 24, duration: dur(0.55), ease: 'power3.out' }, '-=0.5')
      .from('.lg-field', { autoAlpha: 0, y: 10, stagger: 0.06, duration: dur(0.4) }, '-=0.25')
  }, { scope: root })

  const submit = async (e) => {
    e?.preventDefault()
    setErr('')
    if (!email.trim() || !pw) { setErr('Enter your username and password.'); return }
    setBusy(true)
    try {
      const data = await postJSON('/login', { username: email.trim(), password: pw })
      onAuth({ token: data.token, ...data.user })
    } catch {
      setErr('Invalid username or password.')
      setBusy(false)
    }
  }

  return (
    <div ref={root} className="h-full grid lg:grid-cols-2 bp-radial aurora-bg">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-10 border-r border-line bp-grid relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent animate-scan" />
        <div className="lg-brand flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand">
            <Icon name="shield" size={22} />
          </span>
          <div>
            <div className="text-lg font-semibold tracking-tight">FraudSentinel</div>
            <div className="text-2xs text-muted">Gemini · Arize · Google Cloud</div>
          </div>
        </div>

        <div className="space-y-7 max-w-md">
          <div className="lg-brand">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">
              Real-time fraud investigation, <span className="grad-text">run by an agent.</span>
            </h1>
            <p className="text-sub mt-3 leading-relaxed">
              An autonomous analyst that gathers evidence, reasons with Gemini, acts in under
              two seconds, and stays fully auditable in Arize.
            </p>
          </div>
          <div className="space-y-3">
            {FEATURES.map(([icon, t, d]) => (
              <div key={t} className="lg-feat flex items-start gap-3">
                <span className="mt-0.5 grid place-items-center w-8 h-8 rounded-lg bg-raised border border-line text-brand shrink-0">
                  <Icon name={icon} size={15} />
                </span>
                <div>
                  <div className="text-sm font-medium text-txt">{t}</div>
                  <div className="text-2xs text-muted leading-relaxed">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg-brand text-2xs text-muted font-mono">SOC-2 · AML/KYC · FinCEN-ready SAR drafting</div>
      </div>

      {/* Sign-in panel — the only way in */}
      <div className="flex items-center justify-center p-6">
        <div className="lg-card w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand/15 border border-brand/30 text-brand"><Icon name="shield" size={18} /></span>
            <span className="font-semibold tracking-tight">FraudSentinel</span>
          </div>

          <h2 className="lg-field text-xl font-semibold tracking-tight">Sign in to the console</h2>
          <p className="lg-field text-2xs text-muted mt-1">Authorised demo account only.</p>

          <form onSubmit={submit} className="space-y-3.5 mt-6">
            <Field label="Username" icon="userCheck" value={email} onChange={setEmail}
              placeholder="analyst@fraudsentinel.ai" type="text" autoComplete="username" />
            <Field label="Password" icon="shield" value={pw} onChange={setPw}
              placeholder="••••••••••••" type="password" autoComplete="current-password" />

            {err && <div className="lg-field text-2xs text-block flex items-center gap-1.5"><Icon name="alert" size={12} /> {err}</div>}

            <button type="submit" disabled={busy}
              className={cls('lg-field w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors',
                busy ? 'bg-raised text-muted' : 'bg-brand text-onbrand hover:brightness-110')}>
              {busy ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="shield" size={15} />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="lg-field text-[10px] text-muted/70 text-center mt-6 font-mono">
            Access is restricted to the demo account. No public sign-up.
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, icon, value, onChange, placeholder, type = 'text', autoComplete }) {
  return (
    <label className="lg-field block">
      <span className="text-2xs text-muted">{label}</span>
      <div className="mt-1 flex items-center gap-2 bg-ink border border-line rounded-lg px-3 focus-within:border-brand/50 transition-colors">
        <span className="text-muted"><Icon name={icon} size={14} /></span>
        <input type={type} value={value} placeholder={placeholder} autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent py-2.5 text-sm text-txt placeholder:text-muted/60 outline-none" />
      </div>
    </label>
  )
}
