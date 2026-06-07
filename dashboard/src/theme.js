import { useState, useEffect, useCallback } from 'react'
import SunCalc from 'suncalc'

const KEY = 'fs_theme'        // 'auto' | 'light' | 'dark'
const COORD_KEY = 'fs_coords'

function apply(resolved) {
  const el = document.documentElement
  el.classList.remove('light', 'dark')
  el.classList.add(resolved)
}

// IP-based coordinates (cached 24h) so we can compute the local sunset.
async function getCoords() {
  try {
    const c = JSON.parse(localStorage.getItem(COORD_KEY) || 'null')
    if (c && Date.now() - c.t < 864e5) return c
  } catch {}
  try {
    const r = await fetch('https://ipapi.co/json/')
    if (r.ok) {
      const j = await r.json()
      if (j && j.latitude != null) {
        const c = { lat: j.latitude, lng: j.longitude, city: j.city, t: Date.now() }
        localStorage.setItem(COORD_KEY, JSON.stringify(c))
        return c
      }
    }
  } catch {}
  return null
}

function autoByHour() {
  const h = new Date().getHours()
  return (h >= 7 && h < 19) ? 'light' : 'dark'
}

// Light between local sunrise and sunset; dark otherwise.
export async function resolveAuto() {
  const c = await getCoords()
  if (!c) return { resolved: autoByHour(), info: 'by local time' }
  const now = new Date()
  const t = SunCalc.getTimes(now, c.lat, c.lng)
  const isDay = now >= t.sunrise && now < t.sunset
  const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return { resolved: isDay ? 'light' : 'dark', info: `${c.city || 'local'} · sunset ${fmt(t.sunset)}` }
}

export function useTheme() {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(KEY) || 'auto' } catch { return 'auto' }
  })
  const [resolved, setResolved] = useState(() =>
    (mode === 'light' || mode === 'dark') ? mode : autoByHour())
  const [info, setInfo] = useState('')

  useEffect(() => {
    let alive = true
    const run = async () => {
      if (mode === 'light' || mode === 'dark') {
        if (!alive) return
        setResolved(mode); setInfo('manual'); apply(mode)
        return
      }
      const { resolved: r, info: i } = await resolveAuto()
      if (!alive) return
      setResolved(r); setInfo(i); apply(r)
    }
    run()
    const id = setInterval(run, 5 * 60 * 1000) // re-evaluate every 5 min in auto mode
    return () => { alive = false; clearInterval(id) }
  }, [mode])

  const cycle = useCallback(() => {
    setMode(m => {
      const next = m === 'auto' ? 'light' : m === 'light' ? 'dark' : 'auto'
      try { localStorage.setItem(KEY, next) } catch {}
      return next
    })
  }, [])

  return { mode, resolved, info, cycle }
}
