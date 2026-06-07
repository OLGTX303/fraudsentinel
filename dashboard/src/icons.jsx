// Bespoke inline-SVG icon set (stroke style, inherits currentColor).
// Using real icons instead of emoji is a big part of not looking template-generated.

const P = {
  shield:    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
  pulse:     <path d="M3 12h4l2-6 4 12 2-6h6" />,
  layers:    <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 16l9 5 9-5" /></>,
  radar:     <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 12l6-4" /></>,
  bars:      <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></>,
  play:      <path d="M7 5l11 7-11 7V5z" />,
  refresh:   <><path d="M21 12a9 9 0 11-3-6.7" /><path d="M21 4v5h-5" /></>,
  check:     <path d="M4 12l5 5 11-12" />,
  x:         <path d="M6 6l12 12M18 6L6 18" />,
  flag:      <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  alert:     <><path d="M12 3l9 16H3l9-16z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>,
  search:    <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  cpu:       <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>,
  scale:     <><path d="M12 4v16" /><path d="M6 8h12" /><path d="M6 8l-3 6h6l-3-6z" /><path d="M18 8l-3 6h6l-3-6z" /></>,
  clock:     <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  file:      <><path d="M7 3h7l5 5v13H7V3z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h6" /></>,
  chevronR:  <path d="M9 6l6 6-6 6" />,
  chevronD:  <path d="M6 9l6 6 6-6" />,
  link:      <><path d="M9 15l6-6" /><path d="M10 6l1-1a4 4 0 016 6l-1 1" /><path d="M14 18l-1 1a4 4 0 01-6-6l1-1" /></>,
  userCheck: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6 1.2 0 2.3.35 3.2.95" /><path d="M16 16l2 2 4-4" /></>,
  zap:       <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  history:   <><path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4" /><path d="M3 3v4h4" /><path d="M12 8v4l3 2" /></>,
  globe:     <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3 3.5 3 14 0 18-3-4-3-14 0-18z" /></>,
  gem:       <><path d="M6 3h12l3 6-9 12L3 9l3-6z" /><path d="M3 9h18M9 3l3 6 3-6M12 9v12" /></>,
  list:      <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  card:      <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19" /><path d="M6 14.5h4" /></>,
  wallet:    <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><path d="M16.5 14.5h.01" /><path d="M16 6V4.5a1.5 1.5 0 00-1.9-1.45L4.5 5.6A2 2 0 003 7.5" /></>,
  wifi:      <><path d="M2 8.5a16 16 0 0120 0" /><path d="M5 12a11 11 0 0114 0" /><path d="M8.5 15.5a6 6 0 017 0" /><path d="M12 19h.01" /></>,
  server:    <><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  building:  <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /><path d="M10 21v-3h4v3" /></>,
  chat:      <><path d="M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5A8 8 0 1121 12z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></>,
  send:      <><path d="M21 3L10.5 13.5" /><path d="M21 3l-6.5 18-4-8-8-4L21 3z" /></>,
  sun:       <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  moon:      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
  sunset:    <><path d="M17 18a5 5 0 00-10 0" /><path d="M12 9V2M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4" /></>,
  lock:      <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
}

export function Icon({ name, size = 16, className = '', strokeWidth = 1.6 }) {
  const node = P[name]
  if (!node) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden="true">
      {node}
    </svg>
  )
}

// Map agent tool names → icons (used in the trace + live stream).
export const toolIconName = {
  history_lookup:   'history',
  risk_scorer:      'cpu',
  rule_engine:      'scale',
  threat_feed:      'search',
  related_lookup:   'link',
  gemini_reasoning: 'gem',
  sar_drafter:      'file',
}
