'use client'
import { useEffect } from 'react'

export function EngineStatusProvider() {
  useEffect(() => {
    const check = async () => {
      try {
        await fetch('http://localhost:5000/health', { signal: AbortSignal.timeout(2000) })
      } catch {
        await fetch('/api/auto-start', { method: 'POST' })
      }
    }
    void check()
    const interval = setInterval(() => void check(), 30000)
    return () => clearInterval(interval)
  }, [])
  return null
}
