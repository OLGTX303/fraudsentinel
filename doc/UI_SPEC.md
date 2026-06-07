# FraudSentinel — UI specification (recreate each page)

A page-by-page, prompt-style description of the analyst console. Paste a section into
a UI generator (v0, Figma AI, etc.) or hand it to a designer to rebuild any screen.
The look is a **bespoke fraud-operations console**: deep ink background, a single gold
"sentinel" accent, dense data, monospaced numbers, hairline borders — deliberately *not*
the generic glassy-card AI look.

---

## 0. Global design system (applies to every page)

**Mood:** a financial-crime operations terminal. Calm, dense, precise. Gold = vigilance/brand
(used sparingly); blue = "needs review"; green = allow; red = block.

**Color tokens**
| Token | Hex | Use |
|---|---|---|
| ink | `#070a0f` | app background, deepest wells, status bar |
| surface | `#0b0f16` | sidebar / top bar background (80% opacity over grid) |
| panel | `#0f141d` | cards / panels |
| raised | `#141b26` | inputs, hover rows, inner chips |
| line | `#1b2430` | hairline borders / dividers |
| line2 | `#26313f` | stronger borders, scrollbar hover |
| txt | `#d6dde8` | primary text |
| sub | `#8a97a8` | secondary text |
| muted | `#5b6776` | tertiary / labels / icons at rest |
| brand (gold) | `#f0b429` | logo, active nav, primary CTA, focus, key accents |
| allow (green) | `#3fb950` | ALLOW decisions, "online" |
| flag (blue) | `#4493f8` | FLAG decisions, review |
| block (red) | `#f85149` | BLOCK decisions, drift alert, offline |
| severity | crit `#f85149`, high `#fb8500`, med `#f0b429`, low `#5b6776` | rule severities |

**Type:** UI = *Inter* (variable). Numbers, IDs, code, status bar = *JetBrains Mono* with
`font-variant-numeric: tabular-nums`. Micro-labels ("eyebrows"): 10–11px, uppercase,
letter-spacing 0.14em, weight 600, color `muted`.

**Texture & effects**
- Background = ink with a **32px blueprint grid** (1px lines at ~1.8% white) plus two soft
  radial glows: gold from top-right, blue from bottom-left, both ~5% opacity.
- Borders are **1px hairlines** in `line`; corners `rounded-xl` (12px) on panels, `rounded-lg`
  (8px) on controls. No drop shadows except a near-invisible inset top highlight + deep soft
  shadow on panels (`shadow-panel`).
- Scrollbars: thin (8px), thumb `line`, transparent track.
- Focus ring: 2px gold at 60% opacity, 1px offset.
- Selection highlight: gold at 25%.

**Decision pill** (reused everywhere): rounded-full, 1px border in the decision color at
40%, soft fill of the same color at 10%, a 6px filled dot + uppercase label
(Allow/Flag/Block). Small = 11px text; large = 14px.

**Severity tag:** tiny rounded rect, 1px border + 10% fill in the severity color, uppercase
label (CRITICAL/HIGH/MEDIUM/LOW).

**Motion (GSAP, all respect `prefers-reduced-motion`)**
- Page entrance: sidebar slides in from left; top-bar items fade down with 60ms stagger.
- View swap: content fades up 14px over 0.4s.
- Numbers **count up** (0.7s) whenever they change.
- New panels stagger-fade in; the live decision card rises, then its pill **pops** with
  `back.out(2)`; key-signal lines stagger in.
- Drift card **shakes** (7× 5px) and glows red when status flips to "alert".
- Primary CTA has a slow breathing scale (1.0↔1.015) while idle; elastic press feedback.
- Drawer slides in from the right (0.45s, power3.out) over a blurred backdrop.

---

## 1. App shell (frame around every page)

**Layout:** full-height flex. Left **sidebar rail 210px fixed**, right **main column flex-1**.

**Sidebar (surface bg, right hairline border):**
- Top (padded, bottom hairline): a 32px rounded-lg square with gold 15% fill + gold 30%
  border holding a **shield icon** in gold; beside it the wordmark **"FraudSentinel"** (14px
  semibold) and a 10px muted sub-line **"Gemini · Arize · GCP"**.
- Nav (4 items): each a full-width button, icon + two-line label (title 14px medium + 10px
  muted sub). Items: **Console** (pulse icon, "Live investigation") · **Cases** (layers,
  "Review queue") · **Trace** (radar, "Arize spans") · **Analytics** (bar-chart, "Metrics &
  drift"). **Active state:** `raised` background, a 2px gold vertical bar pinned to the left
  edge, and the icon turns gold. Hover: text brightens, faint raised bg.
- Footer (top hairline): a live status dot — green with an expanding **ping** ring when
  connected ("Agent online"), grey when reconnecting — and below it the active model id in
  mono muted (e.g. `gemini-2.0-flash`).

**Main column (blueprint-grid bg):**
- **Top bar (64px, surface 60% + backdrop blur, bottom hairline):** left = page **title**
  (16px semibold) + 11px muted **subtitle**; right = a "demo data" outline chip (only in demo
  mode) and a gold-outline mono chip showing the model id.
- **Content area:** scrollable, padded 24px, inner `max-w-6xl` centered.
- **Bottom status bar (28px, ink bg, top hairline, 10px mono muted):** left→right:
  `● CONNECTED` (green) / `OFFLINE` (red) · `cases {N}` · `avg {ms}ms` · `drift {status}`
  (red when alert) · right-aligned `observability: Arize OpenInference`.

---

## 2. Console (default view)

**Purpose:** fire transactions and watch the agent reason live.
**Top-bar title:** "Investigation console" / "Fire transactions and watch the agent reason in real time".

**Grid:** 12-col. Left **controls (col-span-4)**, right **results (col-span-8)**. Stacks to
one column below the lg breakpoint.

### Left column
1. **Control panel (card):**
   - A small segmented toggle (pill of two): **Preset** | **Custom** (active tab = `raised`).
   - *Preset mode:* four selectable scenario cards, each a bordered button with a colored
     title + muted one-line description:
     - "Clean payment" (green) — "$42 coffee, domestic card"
     - "Fraud attempt" (red) — "$4,200 card/IP mismatch, threat IP"
     - "Drift burst" (gold) — "Novel high-risk pattern → Arize alert"
     - "Escalation case" (blue) — "$8,500 high-value, ambiguous"
     Selected card = gold 50% border + gold 5% fill. Below: a full-width **gold CTA**
     "▷ Run investigation" (dark text). Disabled (grey) while running/disconnected; shows a
     spinning refresh icon + "Investigating…" while running.
   - *Custom mode:* a compact form — Amount, Merchant, Card country, IP country, IP address,
     Hour (2-col grid of mono inputs on ink bg), an "International transaction" checkbox, and
     a gold-outline "▷ Investigate custom transaction" button.
   - Hairline divider, then a footer row: a **Live stream** toggle (left; turns red with a
     pulsing dot + "Stop live stream" when on) and a **"⚡ Simulate 25 (drift)"** button (right).
2. **Arize drift monitor (card):** eyebrow "ARIZE DRIFT MONITOR" with a radar icon and a
   right-aligned status word (CALIBRATING grey / OK green / ALERT red). A row "PSI
   `0.0000` / 0.2000" in mono. When ≥2 recent scores exist, a small sparkline below
   (blue normally, red on alert). Border/fill tints red on alert and the whole card shakes.
3. **Live agent trace (card, only while/after a run):** eyebrow "LIVE AGENT TRACE" with a
   pulse icon and a pulsing gold dot while running. A scrollable list of step rows (max-h ~320,
   each slides in from the left): tool icon + mono tool name + right-aligned state
   ("running" muted / "done" green). Tools in order: history_lookup, risk_scorer, rule_engine,
   threat_feed, (optional) related_lookup, gemini_reasoning, sar_drafter.

### Right column
1. **KPI strip:** 4 tiles (2-col on mobile, 4-col on md). Each = card with an eyebrow label and
   a big tabular **count-up** number: **Investigated** (txt), **Blocked** (red), **Avg latency**
   (green, "ms" unit), **Agentic calls** (gold).
2. **Latest decision card** (or an empty state with a shield icon + "Run an investigation to
   begin"):
   - **Header row:** large decision pill · transaction id (mono, muted, truncated) + merchant ·
     amount line · right side: a method chip ("⬡ agentic" gold-outline, or "pipeline" grey) and
     processing ms.
   - **Body, two columns:**
     - Left: a **risk meter** (eyebrow "RISK SCORE" + the 0–1 value in the band color; a 8px
       rounded track that **fills** to score% in green/gold/red). Then "AGENT REASONING" eyebrow
       + the plain-English reasoning paragraph. Then two **threat tags** (IP / Card) — red with
       an alert icon when flagged, muted with a check when clean.
     - Right: "KEY SIGNALS" eyebrow + a bullet list (gold chevron + short driver text, lines
       stagger in). If the agent ran a deeper lookup: a small raised box "Agent ran deeper
       lookup" with the note + "{n} tx / 24h · ${total}". Then "RULE VIOLATIONS (n)" + a wrap of
       severity tags.
   - **SAR section (only on BLOCK):** eyebrow "SAR DRAFT (auto-generated)" + a mono pre block on
     ink bg (max-h ~176, scroll).
   - **Footer row (top hairline):** the **Analyst review** control — "Confirm" (green outline,
     check icon) + two "Override → {Decision}" buttons; after submit it collapses to
     "✓ Analyst feedback logged to Arize". Right-aligned: "◎ Open Arize trace" link.

---

## 3. Cases

**Purpose:** a reviewable queue of every investigation.
**Top-bar title:** "Case queue" / "Every investigation, reviewable with human-in-the-loop override".

**Single full-width card:**
- **Header row:** eyebrow "CASE QUEUE" (layers icon) + right-aligned segmented filter
  (All / Block / Flag / Allow; active = `raised`).
- **Table** (full width, 12px text). Columns (header = eyebrow style): **Time** (mono muted) ·
  **Decision** (pill) · **Account** (mono sub) · **Merchant** (txt) · **Amount** (mono, right
  feel) · **Risk** (mono, colored by band) · **Method** (gold ⬡ for agentic, "·" otherwise; a
  blue user-check icon if an analyst override exists) · a trailing chevron. Rows: bottom
  hairline, hover = raised tint, cursor pointer. Empty state inside the card when no rows.
- **Row click → right slide-over Drawer** (max-w-xl, surface bg, left hairline, blurred
  backdrop): header (decision pill + tx id + merchant·amount, close ✕) → risk meter →
  "REASONING" → "KEY SIGNALS" bullets → "RULE VIOLATIONS" (each a small bordered block:
  severity tag + mono rule id + name + description) → "SAR DRAFT" mono block (if any) →
  hairline → Analyst review buttons → "◎ Open Arize trace" link.

---

## 4. Trace

**Purpose:** the per-investigation OpenInference span waterfall exported to Arize.
**Top-bar title:** "Observability" / "OpenInference trace exported to Arize for every decision".

**Grid:** left **col-span-8**, right **col-span-4**.
- **Left — Trace card:** eyebrow "INVESTIGATION TRACE (OPENINFERENCE / ARIZE)" with a radar icon
  and a right-aligned truncated trace id (mono). The **waterfall**: one row per span — a fixed
  128px mono label (tool/name), a small **kind chip** colored by kind, a flex track holding a
  colored bar positioned/sized by the span's relative weight, and a right-aligned ms estimate.
  Rows slide in left with stagger. Span kind colors: **TOOL** blue, **LLM** gold, **CHAIN**
  green, **EVAL** purple (`#a371f7`), **ALERT** red. Below the waterfall: a gold-tint info strip
  "Full waterfall, evals & drill-down in Arize → app.arize.com". Empty/late states: "No trace
  selected" (radar icon) or "Trace not found".
- **Right — summary stack:** a small card with the decision pill + risk meter + reasoning
  snippet, and a **legend card** ("SPAN TYPES") listing the 4 kind swatches + labels.

---

## 5. Analytics

**Purpose:** aggregate metrics + model drift.
**Top-bar title:** "Analytics" / "Decision mix, latency, risk distribution and model drift".

- **KPI strip (4 tiles):** **Total investigated** · **Avg risk** (gold, 3 decimals) ·
  **p95 latency** (blue, "ms") · **Agent agreement** (green, "%").
- **Charts grid (12-col):**
  - **Decision distribution (col-5 card):** a **donut** (12px ring, segments green/blue/red,
    segments fade in with stagger) + a legend list (color swatch · label · count · percent).
  - **Risk-score distribution (col-7 card):** a **histogram** of 10 bins (0.0–1.0); bars
    colored green (<0.4) / gold (<0.7) / red (≥0.7), each bar grows from the bottom with
    stagger; tiny bin labels beneath.
  - **Risk over last N decisions (col-7 card):** a gold **sparkline** with a soft area fill.
  - **Drift & autonomy (col-5 card):** a small key/value list — "Drift PSI" (value + status),
    "Agentic decisions" ("{n} / {total}"), "Analyst overrides" (count).
- Empty state (no data yet): bar-chart icon + "No data yet" / "Run investigations (or use
  ‘Simulate 25’) to populate analytics."

---

## Component cheat-sheet (build these once, reuse)

- **Panel** — `rounded-xl border-line bg-panel shadow-panel`.
- **Eyebrow** — optional leading icon (muted) + uppercase micro-label, optional right slot.
- **Kpi** — Panel + eyebrow + count-up number (+ optional unit / sparkline).
- **DecisionPill / SeverityTag** — see global system.
- **RiskMeter** — labeled track that animates its fill width to score%.
- **Sparkline / Histogram / Donut** — pure inline SVG, colored by the tokens above.
- **TraceWaterfall** — ordered rows: label · kind chip · positioned bar · ms.
- **Drawer** — right slide-over + blurred backdrop, GSAP slide.
- **Icon** — single inline-SVG set, 24-viewBox, `stroke=currentColor`, 1.6 width, round caps
  (shield, pulse, layers, radar, bars, play, refresh, check, x, flag, alert, search, cpu,
  scale, clock, file, chevrons, link, user-check, zap, history, globe, gem, list). **No emoji.**
