'use client'
import { useEffect } from 'react'

export function EngineStatusProvider() {
  useEffect(() => {
    const check = async () => {
      try {
        await fetch('http://localhost:5000/health', { signal: AbortSignal.timeout(500) })
      } catch {
        // Fire-and-forget: don't await auto-start, don't block the UI
        fetch('/api/auto-start', { method: 'POST' }).catch(() => {})
      }
    }
    // Delay initial check so shell renders first
    const initial = setTimeout(() => void check(), 3000)
    const interval = setInterval(() => void check(), 30000)
    return () => { clearTimeout(initial); clearInterval(interval) }
  }, [])
  return null
}
