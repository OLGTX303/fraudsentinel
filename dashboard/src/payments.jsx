import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, ExpressCheckoutElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Icon } from './icons.jsx'
import { cls, PAYMENT, detectCardBrand, CARD_BRANDS, authToken, getJSON, postJSON } from './lib.js'
import { CardBrandMark } from './ui.jsx'

// Apple's merchant identifier (override for production with your own).
const APPLEPAY_MERCHANT_ID = (typeof window !== 'undefined' && window.FS_APPLEPAY_MERCHANT_ID) || 'merchant.com.apdemo'

// Server-side merchant validation (needs your Apple merchant cert to succeed).
async function validateMerchant(validationURL) {
  const t = authToken()
  const r = await fetch('/api/applepay/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify({ validationURL }),
  })
  if (!r.ok) throw new Error('merchant validation unavailable')
  return r.json()
}

// Apple Pay via the W3C Payment Request API (Apple's recommended web flow).
// On Apple/Safari → native sheet; on Chrome/Edge → native "Scan with iPhone" QR.
// Returns 'paid' | 'cancelled' | 'unsupported'.
async function startApplePayRequest(amount) {
  if (typeof window === 'undefined' || typeof window.PaymentRequest === 'undefined') return 'unsupported'
  const methodData = [{
    supportedMethods: 'https://apple.com/apple-pay',
    data: {
      version: 3, merchantIdentifier: APPLEPAY_MERCHANT_ID,
      merchantCapabilities: ['supports3DS'],
      supportedNetworks: ['amex', 'discover', 'masterCard', 'visa'],
      countryCode: 'US',
    },
  }]
  const details = { total: { label: 'FraudSentinel (card not charged)', amount: { value: String(amount || '1.00'), currency: 'USD' } } }
  const options = { requestPayerName: false, requestShipping: false }
  let request
  try { request = new window.PaymentRequest(methodData, details, options) } catch { return 'unsupported' }
  try { if (!(await request.canMakePayment())) return 'unsupported' } catch { return 'unsupported' }

  request.onmerchantvalidation = (event) => {
    event.complete(validateMerchant(event.validationURL))
  }
  try {
    const response = await request.show()   // native Apple Pay sheet OR Scan-with-iPhone QR
    await response.complete('success')
    return 'paid'
  } catch {
    return 'cancelled'                       // user dismissed, or validation not configured
  }
}

// ── External SDK loader (once) ────────────────────────────────────
const loaded = {}
function loadScript(src) {
  if (loaded[src]) return loaded[src]
  loaded[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src; s.async = true
    s.onload = () => resolve(true)
    s.onerror = () => reject(new Error('load failed: ' + src))
    document.head.appendChild(s)
  })
  return loaded[src]
}

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

// Map a scenario sample to the matching network rail (so the broadband-only
// rule reflects the chosen sample). Falls back to IP match, then datacenter.
const _SCENARIO_NETWORK = { clean: 'residential', escalate: 'residential', fraud: 'datacenter', drift: 'datacenter' }
function networkForSample(key, sample) {
  if (key && _SCENARIO_NETWORK[key]) return _SCENARIO_NETWORK[key]
  const ip = sample?.ip_address
  if (ip) {
    const hit = Object.entries(NETWORKS).find(([, n]) => n.ip === ip)
    if (hit) return hit[0]
  }
  return 'datacenter'
}

// ══════════════════════════════════════════════════════════════════
export function PaymentTester({ onRun, disabled, latest, sampleKey, sample }) {
  const [amount, setAmount] = useState(() => Number(sample?.amount ?? 4200).toFixed(2))
  const [merchant, setMerchant] = useState(sample?.merchant || 'ElectroMart Online')
  const [network, setNetwork] = useState(() => networkForSample(sampleKey, sample))

  // Keep the Test-payment form in sync with the selected scenario sample.
  useEffect(() => {
    if (!sample) return
    if (sample.amount != null) setAmount(Number(sample.amount).toFixed(2))
    if (sample.merchant) setMerchant(sample.merchant)
    setNetwork(networkForSample(sampleKey, sample))
  }, [sampleKey]) // eslint-disable-line

  // Deep link from the "Scan with iPhone" QR: ?amt=... (overrides the sample amount)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const amt = new URLSearchParams(window.location.search).get('amt')
    if (amt && !Number.isNaN(Number(amt))) setAmount(Number(amt).toFixed(2))
  }, [])

  const amountNum = Number(amount) || 0
  const inputCls = 'w-full bg-ink border border-line rounded-md px-2.5 py-2 text-xs text-txt focus:border-brand/50 outline-none'

  // Wallet/PayPal sandbox rails → fire the agent investigation with the real method.
  const fireRail = (pm) => {
    const n = NETWORKS[network]
    onRun({
      account_id: 'ACC-CHECKOUT-001', amount: amountNum, currency: 'USD',
      merchant: merchant || 'Merchant', merchant_category: 'general',
      card_country: 'US', ip_address: n.ip, ip_country: n.country,
      device_id: 'DEV-CHECKOUT-01', is_international: n.intl, hour_of_day: new Date().getHours(),
      card_token: '0000', payment_method: pm,
    }, pm)
  }

  return (
    <div className="space-y-3">
      {/* amount + merchant */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="text-2xs text-muted">Amount (USD)</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={cls(inputCls, 'mt-0.5 font-mono')} /></label>
        <label className="block"><span className="text-2xs text-muted">Merchant</span>
          <input value={merchant} onChange={e => setMerchant(e.target.value)} className={cls(inputCls, 'mt-0.5')} /></label>
      </div>

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

      {/* Real Stripe checkout — card + Apple Pay + Google Pay, analysed by our agent */}
      <StripeCheckout amount={amountNum} merchant={merchant} network={network}
        disabled={disabled} onRun={onRun} latest={latest} />

      {/* Google Pay (sandbox) — always shown on desktop, routed to the agent */}
      <div className="pt-1">
        <div className="flex items-center gap-2 mb-2 text-2xs text-muted">
          <span className="hr flex-1" /> or test Google Pay (sandbox) <span className="hr flex-1" />
        </div>
        <GooglePayButton amount={amountNum} disabled={disabled}
          onPaid={() => fireRail('google_pay', 'google_pay')} />
        <div className="text-[10px] text-muted text-center mt-1.5">Google Pay TEST environment · approval routed to the fraud agent</div>
      </div>

      {/* PayPal sandbox — separate rail, also analysed by the agent */}
      <div className="pt-1">
        <div className="flex items-center gap-2 mb-2 text-2xs text-muted">
          <span className="hr flex-1" /> or test PayPal (sandbox) <span className="hr flex-1" />
        </div>
        <PayPalButton amount={amountNum} disabled={disabled}
          onPaid={() => fireRail('paypal', 'paypal')} />
        <div className="text-[10px] text-muted text-center mt-1.5">PayPal Sandbox · approval routed to the fraud agent</div>
      </div>
    </div>
  )
}

// Read a `--c-*` theme token (stored as "R G B" channels) as a CSS rgb() string.
function themeRGB(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `rgb(${v})` : fallback
}

// Build a Stripe Elements appearance from the app's LIVE theme tokens so the
// checkout matches whichever theme (dark / light / sunset-resolved) is active.
function buildStripeAppearance() {
  const light = typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  return {
    theme: light ? 'stripe' : 'night',
    labels: 'floating',
    variables: {
      colorPrimary:          themeRGB('--c-brand', '#e8b53d'),
      colorBackground:       themeRGB('--c-raised', light ? '#f1f4f8' : '#141b26'),
      colorText:             themeRGB('--c-txt', light ? '#182130' : '#d6dde8'),
      colorTextSecondary:    themeRGB('--c-sub', '#8a97a8'),
      colorTextPlaceholder:  themeRGB('--c-muted', '#5b6776'),
      colorDanger:           themeRGB('--c-block', '#f85149'),
      borderRadius: '8px',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
    rules: {
      '.Input':          { backgroundColor: themeRGB('--c-ink', '#070a0f'), border: `1px solid ${themeRGB('--c-line2', '#26313f')}` },
      '.Input:focus':    { border: `1px solid ${themeRGB('--c-brand', '#e8b53d')}`, boxShadow: 'none' },
      '.Tab':            { backgroundColor: themeRGB('--c-raised', '#141b26'), border: `1px solid ${themeRGB('--c-line', '#1b2430')}` },
      '.Tab--selected':  { borderColor: themeRGB('--c-brand', '#e8b53d') },
      '.Label':          { color: themeRGB('--c-sub', '#8a97a8') },
    },
  }
}

// Recompute the appearance whenever the <html> theme class flips.
function useStripeAppearance() {
  const [appearance, setAppearance] = useState(buildStripeAppearance)
  useEffect(() => {
    const update = () => setAppearance(buildStripeAppearance())
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return appearance
}

// ── Stripe checkout (real card + wallets), gated by FraudSentinel ────
// Money is AUTHORISED with manual capture, then the agent decides: ALLOW/FLAG
// captures the funds, BLOCK voids the authorisation — a real fraud control loop.
const _stripeCache = {}
function StripeCheckout({ amount, merchant, network, disabled, onRun, latest }) {
  const appearance = useStripeAppearance()
  const [cfg, setCfg] = useState(null)         // null = loading, {enabled, sp}
  const [clientSecret, setClientSecret] = useState('')
  const [intentId, setIntentId] = useState('')
  const [err, setErr] = useState('')
  const [nonce, setNonce] = useState(0)        // bump → fresh PaymentIntent for another test

  useEffect(() => {
    getJSON('/stripe/config').then(c => {
      if (c.enabled && c.publishable_key) {
        if (!_stripeCache[c.publishable_key]) _stripeCache[c.publishable_key] = loadStripe(c.publishable_key, {
          // Turn off the Stripe.js test-mode developer assistant (the floating "stripe" pill).
          developerTools: { assistant: { enabled: false } },
        })
        setCfg({ enabled: true, sp: _stripeCache[c.publishable_key] })
      } else setCfg({ enabled: false })
    }).catch(() => setCfg({ enabled: false }))
  }, [])

  // (Re)create a manual-capture PaymentIntent whenever the amount changes.
  useEffect(() => {
    if (!cfg?.enabled || !(amount >= 0.5)) return
    let cancel = false
    const t = setTimeout(() => {
      setErr('')
      postJSON('/stripe/intent', { amount, currency: 'usd' })
        .then(d => { if (!cancel) { setClientSecret(d.client_secret); setIntentId(d.id) } })
        .catch(() => { if (!cancel) setErr('Could not start Stripe checkout.') })
    }, 450)
    return () => { cancel = true; clearTimeout(t) }
  }, [cfg, amount, nonce])

  if (cfg === null) return <div className="rounded-lg border border-line bg-raised/40 p-3 text-2xs text-muted">Loading secure Stripe checkout…</div>
  if (!cfg.enabled) return (
    <div className="rounded-lg border border-flag/40 bg-flag/5 p-3 text-2xs text-sub">
      Stripe isn’t configured. Set <code className="text-flag">STRIPE_SECRET_KEY</code> and <code className="text-flag">STRIPE_PUBLISHABLE_KEY</code> on the server.
    </div>
  )
  if (err) return <div className="rounded-lg border border-block/40 bg-block/5 p-3 text-2xs text-block">{err}</div>
  if (!clientSecret) return <div className="rounded-lg border border-line bg-raised/40 p-3 text-2xs text-muted">Preparing payment for ${amount.toFixed(2)}…</div>

  return (
    <Elements key={clientSecret} stripe={cfg.sp}
      options={{ clientSecret, appearance }}>
      <StripeForm amount={amount} merchant={merchant} network={network} disabled={disabled}
        onRun={onRun} latest={latest} intentId={intentId} onReset={() => setNonce(n => n + 1)} />
    </Elements>
  )
}

function StripeForm({ amount, merchant, network, disabled, onRun, latest, intentId, onReset }) {
  const stripe = useStripe()
  const elements = useElements()
  const [phase, setPhase] = useState('idle')   // idle | paying | authorized | done | error
  const [card, setCard] = useState(null)
  const [stripeAction, setStripeAction] = useState('')  // captured | voided
  const [msg, setMsg] = useState('')
  const baselineTx = useRef(null)

  // Wait for the agent verdict (latest changes after our auth) → only THEN move/void funds.
  useEffect(() => {
    if (phase !== 'authorized' || !latest || !latest.transaction_id) return
    if (latest.transaction_id === baselineTx.current) return   // not our result yet
    const decision = latest.decision
    setPhase('done')
    postJSON('/stripe/finalize', { payment_intent_id: intentId, decision })
      .then(r => setStripeAction(r.action))
      .catch(() => setStripeAction('error'))
  }, [latest, phase, intentId])

  const [wallets, setWallets] = useState(null)   // null = probing, [] = none, [..] = available

  // Shared: once Stripe authorises, hand the REAL payment data to our agent.
  const afterAuthorize = async () => {
    const meta = await getJSON(`/stripe/card/${intentId}`).catch(() => ({}))
    setCard(meta)
    const n = NETWORKS[network]
    const pm = meta.wallet === 'apple_pay' ? 'apple_pay'
      : meta.wallet === 'google_pay' ? 'google_pay'
      : meta.type === 'paypal' ? 'paypal'
      : meta.type === 'link' ? 'card' : 'card'
    baselineTx.current = latest?.transaction_id || null
    setPhase('authorized')
    onRun({
      account_id: 'ACC-CHECKOUT-001', amount, currency: 'USD',
      merchant: merchant || 'Merchant', merchant_category: 'general',
      card_country: meta.country || 'US', ip_address: n.ip, ip_country: n.country,
      device_id: 'DEV-CHECKOUT-01', is_international: n.intl, hour_of_day: new Date().getHours(),
      card_token: `${meta.bin || '000000'}0000${meta.last4 || '0000'}`,
      payment_method: pm,
    }, 'stripe')
  }

  const confirmNow = async () => {
    const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (error) { setPhase('error'); setMsg(error.message || 'Payment could not be authorised.'); return false }
    return true
  }

  const pay = async () => {
    if (!stripe || !elements || disabled || phase === 'paying') return
    setPhase('paying'); setMsg('')
    if (await confirmNow()) await afterAuthorize()
  }

  // Apple Pay / Google Pay / PayPal (Express Checkout) → same agent-gated flow.
  const onWalletConfirm = async () => {
    setPhase('paying'); setMsg('')
    if (await confirmNow()) await afterAuthorize()
  }

  // Show the checkout inputs only before authorisation; afterwards show the
  // agent-gated status so it's clear the payment is HELD, not yet successful.
  const held = phase === 'authorized' || phase === 'done'
  const decision = phase === 'done' ? latest?.decision : null

  if (held) {
    return (
      <StripeStatusStrip card={card} action={stripeAction} decision={decision} amount={amount}
        onReset={() => { setPhase('idle'); setCard(null); setStripeAction(''); setMsg(''); onReset?.() }} />
    )
  }

  return (
    <div className="space-y-2.5">
      {/* Apple Pay · Google Pay · PayPal — native wallet buttons (domain-registered) */}
      <div className={cls(wallets !== null && wallets.length === 0 && 'hidden')}>
        <ExpressCheckoutElement
          onReady={(e) => setWallets(Object.keys(e?.availablePaymentMethods || {}))}
          onConfirm={onWalletConfirm}
          options={{ buttonHeight: 44, layout: { maxColumns: 2, overflow: 'auto' } }} />
        {wallets && wallets.length > 0 && (
          <div className="flex items-center gap-2 my-2 text-2xs text-muted">
            <span className="hr flex-1" /> or pay by card <span className="hr flex-1" />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-raised/40 p-2.5">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      <button disabled={!stripe || disabled || phase === 'paying'} onClick={pay}
        className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-brand text-onbrand hover:brightness-110 shadow-glow active:scale-[0.98] disabled:opacity-50">
        {phase === 'paying'
          ? <><Icon name="refresh" size={14} className="animate-spin" /> Authorising…</>
          : <><Icon name="lock" size={14} /> Authorise ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</>}
      </button>
      {msg && <div className="text-2xs text-block">{msg}</div>}
      <div className="text-[10px] text-muted text-center">Stripe test mode · funds are only captured after the agent approves</div>
    </div>
  )
}

// Agent-gated money flow as a vertical stepper: the payment is HELD until the
// fraud agent decides — only then is it captured (approved) or voided (blocked).
function StripeStatusStrip({ card, action, decision, amount, onReset }) {
  const brand = (card?.brand || '').toLowerCase()
  const reviewing = !decision
  const settled = !!action && action !== ''
  // Final outcome only once Stripe has actually captured/voided.
  const outcome = reviewing ? null
    : action === 'voided' ? 'declined'
    : action === 'captured' ? (decision === 'FLAG' ? 'flagged' : 'approved')
    : null   // decided but capture/void still in flight

  const amt = `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const Step = ({ state, title, sub }) => (
    <div className="flex items-start gap-2.5">
      <span className={cls('mt-0.5 grid place-items-center w-5 h-5 rounded-full shrink-0 border',
        state === 'done' ? 'border-allow/50 bg-allow/15 text-allow'
        : state === 'active' ? 'border-brand/50 bg-brand/15 text-brand'
        : state === 'block' ? 'border-block/50 bg-block/15 text-block'
        : state === 'flag' ? 'border-flag/50 bg-flag/15 text-flag'
        : 'border-line text-muted')}>
        {state === 'active' ? <Icon name="refresh" size={11} className="animate-spin" />
          : state === 'block' ? <Icon name="x" size={11} />
          : state === 'done' || state === 'flag' ? <Icon name="check" size={11} />
          : <span className="w-1 h-1 rounded-full bg-current" />}
      </span>
      <div className="min-w-0">
        <div className={cls('text-xs font-medium',
          state === 'block' ? 'text-block' : state === 'flag' ? 'text-flag' : state === 'pending' ? 'text-muted' : 'text-txt')}>{title}</div>
        {sub && <div className="text-[11px] text-muted leading-snug">{sub}</div>}
      </div>
    </div>
  )

  return (
    <div className="rounded-xl border border-line bg-ink/60 p-3.5 space-y-3">
      {/* Held banner — payment is NOT charged yet */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={cls('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border',
          outcome === 'approved' ? 'border-allow/50 bg-allow/10 text-allow'
          : outcome === 'declined' ? 'border-block/50 bg-block/10 text-block'
          : outcome === 'flagged' ? 'border-flag/50 bg-flag/10 text-flag'
          : 'border-brand/40 bg-brand/10 text-brand')}>
          <Icon name={outcome === 'declined' ? 'x' : outcome ? 'check' : 'lock'} size={13} />
          {outcome === 'approved' ? `${amt} captured`
            : outcome === 'declined' ? `${amt} declined`
            : outcome === 'flagged' ? `${amt} held for review`
            : `${amt} authorised — held, not charged`}
        </span>
        {card?.last4 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            {brand && <CardBrandMark brand={brand} />}•••• {card.last4}
            {card.country ? ` · ${card.country}` : ''}
          </span>
        )}
      </div>

      {/* Stepper */}
      <div className="space-y-2.5">
        <Step state="done" title="Stripe authorised" sub="Funds reserved with manual capture — no money has moved." />
        <Step
          state={reviewing ? 'active' : (decision === 'BLOCK' ? 'block' : decision === 'FLAG' ? 'flag' : 'done')}
          title={reviewing ? 'Fraud agent reviewing…' : `Agent decision: ${decision}`}
          sub={reviewing ? 'Gemini is analysing the real payment — waiting for the verdict.' : undefined} />
        <Step
          state={!outcome ? 'pending' : outcome === 'declined' ? 'block' : outcome === 'flagged' ? 'flag' : 'done'}
          title={
            !outcome ? 'Outcome — pending'
              : outcome === 'approved' ? 'Approved — payment captured'
              : outcome === 'flagged' ? 'Flagged — captured, held for manual review'
              : 'Declined — authorisation voided'}
          sub={!outcome ? 'Waiting on the agent before any capture.' : undefined} />
      </div>

      {(outcome || (!reviewing && settled)) && (
        <button onClick={onReset}
          className="w-full py-2 rounded-lg text-xs font-medium border border-line text-sub hover:text-txt hover:border-brand/40 transition-colors flex items-center justify-center gap-1.5">
          <Icon name="refresh" size={13} /> Run another payment test
        </button>
      )}
    </div>
  )
}

// ── Realistic card visual ─────────────────────────────────────────
function CardVisual({ brand, number, name, exp }) {
  const b = CARD_BRANDS[brand] || CARD_BRANDS.unknown
  const grad = {
    visa: 'linear-gradient(135deg,#1a1f71,#3b4ad6)', mastercard: 'linear-gradient(135deg,#1a1a1a,#3a2a2a)',
    amex: 'linear-gradient(135deg,#2e77bc,#1c5a96)', unionpay: 'linear-gradient(135deg,#0a1f3c,#13325c)',
    discover: 'linear-gradient(135deg,#2a2a2a,#4a3520)', jcb: 'linear-gradient(135deg,#0b1b3a,#1a2f5c)',
    diners: 'linear-gradient(135deg,#0a2540,#13406b)', unknown: 'linear-gradient(135deg,#1b2430,#26313f)',
  }[brand] || 'linear-gradient(135deg,#1b2430,#26313f)'
  const grouped = (number || '').padEnd(19, '•').slice(0, 19)
  return (
    <div className="relative rounded-xl p-3.5 h-40 text-white overflow-hidden shadow-panel" style={{ background: grad }}>
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
      <div className="flex items-center justify-between">
        <div className="w-9 h-6 rounded bg-gradient-to-br from-yellow-200/90 to-yellow-400/80" />
        <CardBrandMark brand={brand} />
      </div>
      <div className="mt-5 font-mono text-base tracking-[0.18em] tabular-nums">{grouped}</div>
      <div className="mt-4 flex items-end justify-between text-[10px] tracking-wide opacity-90">
        <div><div className="opacity-60 text-[8px]">CARD HOLDER</div>{name || 'YOUR NAME'}</div>
        <div className="text-right"><div className="opacity-60 text-[8px]">EXPIRES</div>{exp || 'MM/YY'}</div>
      </div>
    </div>
  )
}

// ── Apple Pay (device-gated; clean confirm flow) ──────────────────
// Apple Pay has NO credential-free sandbox: the native sheet requires your
// Apple merchant ID + a server-side merchant-validation endpoint (with an Apple
// merchant cert) or it pops up and immediately aborts at `validatemerchant`.
// So we run a clean confirm flow here, then fire the fraud check. To enable the
// real sheet, set window.FS_APPLEPAY_MERCHANT_ID + a /validate-merchant endpoint.
function ApplePayButton({ amount, disabled, onPaid }) {
  const available = typeof window !== 'undefined' && window.ApplePaySession && window.ApplePaySession.canMakePayments?.()
  const [proc, setProc] = useState(false)
  const [qr, setQr] = useState(false)
  const pay = async () => {
    if (disabled || proc) return
    setProc(true)
    // 1) Try Apple's W3C Payment Request flow (native sheet / native QR handoff).
    const r = await startApplePayRequest(amount)
    setProc(false)
    if (r === 'paid') { onPaid(); return }
    if (r === 'unsupported') {
      // 2) Browser can't show Apple Pay at all → our QR handoff (non-Apple) or confirm (Apple).
      if (!available) { setQr(true); return }
      setProc(true); setTimeout(() => { setProc(false); onPaid() }, 1100); return
    }
    // r === 'cancelled' (dismissed or validation not configured) → run the demo check.
    onPaid()
  }
  return (
    <div className="space-y-1.5">
      <button disabled={disabled || proc} onClick={pay}
        className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-black text-white hover:bg-black/90 active:scale-[0.98] disabled:opacity-60">
        {proc
          ? <><Icon name="refresh" size={14} className="animate-spin" /> Confirming with Apple&nbsp;Pay…</>
          : <><AppleGlyph /> Pay</>}
      </button>
      <div className="text-[10px] text-muted text-center leading-relaxed">
        {available ? 'Apple Pay detected on this device.' : 'Not an Apple device — scan with iPhone to continue.'}
      </div>
      {qr && <ApplePayHandoff amount={amount} onClose={() => setQr(false)} onContinue={() => { setQr(false); onPaid() }} />}
    </div>
  )
}

// ── Visa/Mastercard 3-D Secure sandbox (looks like a real bank challenge) ──
const SCHEME_3DS = {
  visa:       { name: 'Verified by Visa',            bg: '#1a1f71' },
  mastercard: { name: 'Mastercard Identity Check',   bg: '#1a1a1a' },
  amex:       { name: 'American Express SafeKey',    bg: '#2e77bc' },
  unionpay:   { name: 'UnionPay 3-D Secure',         bg: '#0a1f3c' },
  discover:   { name: 'Discover ProtectBuy',         bg: '#2a2a2a' },
  jcb:        { name: 'J/Secure',                    bg: '#0b1b3a' },
  diners:     { name: 'ProtectBuy',                  bg: '#0a2540' },
  unknown:    { name: '3-D Secure',                  bg: '#1b2430' },
}
function CardSandboxModal({ brand, amount, last4, merchant, onClose, onApproved }) {
  const [stage, setStage] = useState('challenge')   // challenge | auth | approved
  const [otp, setOtp] = useState('')
  const s = SCHEME_3DS[brand] || SCHEME_3DS.unknown
  const money = `$${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const submit = () => {
    if (otp.replace(/\D/g, '').length < 4) return
    setStage('auth')
    setTimeout(() => { setStage('approved'); setTimeout(onApproved, 1200) }, 1500)
  }
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={stage === 'challenge' ? onClose : undefined}>
      <div onClick={(e) => e.stopPropagation()} className="w-[360px] max-w-[92vw] rounded-2xl bg-white text-[#1a1a1a] overflow-hidden shadow-2xl">
        <div className="px-4 py-3 flex items-center justify-between text-white" style={{ background: s.bg }}>
          <span className="text-sm font-semibold">{s.name}</span>
          <CardBrandMark brand={brand} />
        </div>
        <div className="p-5">
          {stage === 'approved' ? (
            <div className="text-center py-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 text-green-600 grid place-items-center mb-3"><Icon name="check" size={26} /></div>
              <div className="text-base font-semibold text-green-700">Payment authorized</div>
              <div className="text-xs text-gray-500 mt-1">Running fraud investigation…</div>
            </div>
          ) : stage === 'auth' ? (
            <div className="text-center py-6">
              <Icon name="refresh" size={26} className="mx-auto animate-spin text-gray-500" />
              <div className="text-sm text-gray-700 mt-3">Authenticating with your bank…</div>
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500 space-y-1 mb-3">
                <div className="flex justify-between"><span>Merchant</span><span className="font-medium text-gray-800">{merchant || 'Merchant'}</span></div>
                <div className="flex justify-between"><span>Amount</span><span className="font-medium text-gray-800">{money}</span></div>
                <div className="flex justify-between"><span>Card</span><span className="font-mono text-gray-800">•••• {last4}</span></div>
              </div>
              <label className="block text-xs text-gray-600">One-time passcode
                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric"
                  autoFocus placeholder="••••" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-lg tracking-[0.4em] font-mono text-gray-900 focus:border-gray-800 outline-none" />
              </label>
              <div className="text-[10px] text-gray-400 mt-1">Sandbox — enter any 4 digits (e.g. 1234) to authenticate.</div>
              <button onClick={submit} disabled={otp.replace(/\D/g, '').length < 4}
                className="mt-3 w-full py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40" style={{ background: s.bg }}>
                Authenticate
              </button>
              <button onClick={onClose} className="mt-2 w-full py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// "Scan Code with iPhone" handoff (mirrors applepaydemo.apple.com), but with a
// REAL scannable QR so the demo can actually be tested: pointing your iPhone
// camera at it opens the payment-test flow on the phone with the amount prefilled.
function ApplePayHandoff({ amount, onClose, onContinue }) {
  const url = (typeof window !== 'undefined' ? window.location.origin : 'https://fraudsentinel.olgtx.dpdns.org')
    + `/?pay=apple_pay&amt=${encodeURIComponent(amount)}`
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="relative w-[340px] max-w-[92vw] rounded-3xl bg-[#1d1d1f] text-white pt-7 pb-6 px-6 shadow-2xl">
        <button onClick={onClose} aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 text-white"><Icon name="x" size={16} /></button>
        <ScannableApplePayCode url={url} size={210} />
        <h3 className="text-center text-2xl font-semibold mt-5">Scan Code with iPhone</h3>
        <p className="text-center text-sm text-white/70 mt-2 leading-relaxed px-2">
          Point your iPhone camera at the code to continue this Apple&nbsp;Pay test on your phone — the
          ${Number(amount).toFixed(2)} amount is prefilled.
        </p>
        <button onClick={onContinue}
          className="mt-5 w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 text-xs">
          Continue the fraud check on this device
        </button>
      </div>
    </div>
  )
}

// A real, scannable QR styled like Apple's handoff code: white rounded tile,
// black modules, an Apple Pay glyph in the centre (QR error-correction = H so
// the centre overlay doesn't break scanning).
function ScannableApplePayCode({ url, size = 200 }) {
  return (
    <div className="relative mx-auto rounded-3xl bg-white p-4 shadow-lg" style={{ width: size, height: size }}>
      <QRCodeSVG value={url} size={size - 32} level="H" bgColor="#ffffff" fgColor="#0b0b0c"
        style={{ width: '100%', height: '100%' }} />
      <span className="absolute inset-0 grid place-items-center pointer-events-none">
        <span className="flex items-center gap-0.5 text-black font-semibold bg-white rounded-md px-1.5 py-0.5 shadow"
          style={{ fontSize: size * 0.085 }}>
          <AppleGlyph /> Pay
        </span>
      </span>
    </div>
  )
}

// ── Google Pay (real, TEST environment) ───────────────────────────
function GooglePayButton({ amount, disabled, onPaid }) {
  const ref = useRef(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    loadScript('https://pay.google.com/gp/p/js/pay.js').then(() => {
      if (cancelled || !window.google?.payments?.api) return
      const client = new window.google.payments.api.PaymentsClient({ environment: 'TEST' })
      const base = {
        apiVersion: 2, apiVersionMinor: 0,
        allowedPaymentMethods: [{
          type: 'CARD',
          parameters: { allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'], allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'] },
          tokenizationSpecification: { type: 'PAYMENT_GATEWAY', parameters: { gateway: 'example', gatewayMerchantId: 'exampleGatewayMerchantId' } },
        }],
      }
      client.isReadyToPay({ ...base }).then((r) => {
        if (cancelled || !r.result || !ref.current) { setReady(false); return }
        setReady(true)
        const btn = client.createButton({
          buttonColor: 'white', buttonType: 'pay', buttonSizeMode: 'fill',
          onClick: () => {
            client.loadPaymentData({
              ...base, transactionInfo: { totalPriceStatus: 'FINAL', totalPrice: String(amount), currencyCode: 'USD' },
              merchantInfo: { merchantName: 'FraudSentinel Demo' },
            }).then(() => onPaid('gpay')).catch(() => {})
          },
        })
        ref.current.innerHTML = ''
        ref.current.appendChild(btn)
      }).catch(() => setReady(false))
    }).catch(() => setReady(false))
    return () => { cancelled = true }
  }, [amount]) // eslint-disable-line
  return (
    <div>
      <div ref={ref} className={cls('gpay', !ready && 'hidden')} />
      {!ready && (
        <button disabled={disabled} onClick={() => onPaid('gpay')}
          className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-white text-[#3c4043] border border-line2 hover:bg-white/90 active:scale-[0.98] disabled:opacity-50">
          <GPayGlyph /> Pay
        </button>
      )}
    </div>
  )
}

// ── PayPal (real, sandbox client) ─────────────────────────────────
function PayPalButton({ amount, disabled, onPaid }) {
  const ref = useRef(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    loadScript('https://www.paypal.com/sdk/js?client-id=sb&currency=USD&intent=capture').then(() => {
      if (cancelled || !window.paypal || !ref.current) return
      ref.current.innerHTML = ''
      try {
        window.paypal.Buttons({
          style: { layout: 'horizontal', height: 40, tagline: false, color: 'gold', shape: 'pill' },
          createOrder: (data, actions) => actions.order.create({ purchase_units: [{ amount: { value: String(amount || '1.00') } }] }),
          onApprove: () => { onPaid(); return Promise.resolve() },
          onError: () => {},
        }).render(ref.current).then(() => setReady(true)).catch(() => setReady(false))
      } catch { setReady(false) }
    }).catch(() => setReady(false))
    return () => { cancelled = true }
  }, [amount]) // eslint-disable-line
  return (
    <div>
      <div ref={ref} className={cls(!ready && 'hidden')} />
      {!ready && (
        <button disabled={disabled} onClick={() => onPaid()}
          className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-[#ffc439] text-[#003087] hover:brightness-105 active:scale-[0.98] disabled:opacity-50">
          <span className="font-bold italic">Pay<span className="text-[#0070ba]">Pal</span></span>
        </button>
      )}
    </div>
  )
}

function AppleGlyph() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.36 12.78c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.71 0-1.82-.81-3-.79-1.54.02-2.96.9-3.75 2.28-1.6 2.78-.41 6.89 1.15 9.15.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.39 0 1.78.74 3 .72 1.24-.02 2.02-1.12 2.78-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.13 6.6c.64-.78 1.07-1.86.95-2.94-.92.04-2.03.61-2.69 1.39-.59.69-1.11 1.79-.97 2.85 1.02.08 2.07-.52 2.71-1.3z" /></svg>
}
function GPayGlyph() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M12 11v2.8h4.0c-.17.9-.68 1.66-1.45 2.18v1.8h2.34c1.37-1.26 2.16-3.12 2.16-5.32 0-.5-.04-.98-.13-1.46H12z"/><path fill="#34A853" d="M12 19c1.95 0 3.6-.64 4.8-1.74l-2.34-1.8c-.65.44-1.49.7-2.46.7-1.89 0-3.49-1.27-4.06-2.98H5.5v1.86C6.7 17.6 9.16 19 12 19z"/><path fill="#FBBC04" d="M7.94 13.18A4.2 4.2 0 017.7 12c0-.41.07-.81.18-1.18V8.96H5.5A6.97 6.97 0 005 12c0 1.12.27 2.18.74 3.04l2.2-1.86z"/><path fill="#EA4335" d="M12 8.04c1.06 0 2.01.36 2.76 1.08l2.07-2.07C15.6 5.86 13.95 5.2 12 5.2 9.16 5.2 6.7 6.6 5.5 8.96l2.2 1.86C8.27 9.31 9.87 8.04 12 8.04z"/></svg>
}
