'use client'
import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers, type UTCTimestamp, type IChartApi } from 'lightweight-charts'

interface OhlcBar { time: number; open: number; high: number; low: number; close: number }
interface Trade { time: number; win: boolean; dir: string; pnlPct: number; pnlPips?: number }

interface Props {
  data: OhlcBar[]
  trades?: Trade[]
  emaFastData?: { time: number; value: number }[]
  emaSlowData?: { time: number; value: number }[]
  showEma?: boolean
}

function toSec(t: number): number {
  if (t > 1e10) return Math.floor(t / 1000)  // ms → s
  return t
}

export default function LWChart({ data, trades = [], emaFastData = [], emaSlowData = [], showEma = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return

    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { color: '#0A0A0A' }, textColor: '#6B7280' },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: {
        mode: 1,
        vertLine: { color: '#333', width: 1, style: 3 },
        horzLine: { color: '#333', width: 1, style: 3 },
      },
      timeScale: {
        borderColor: '#1A1A1A',
        borderVisible: true,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000)
          return d.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })
        },
      },
      rightPriceScale: {
        borderColor: '#1A1A1A',
        borderVisible: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#F5F5F5',
      downColor: '#EF4444',
      borderUpColor: '#F5F5F5',
      borderDownColor: '#EF4444',
      wickUpColor: '#71717a',
      wickDownColor: '#71717a',
    })

    const emaFastSeries = chart.addSeries(LineSeries, {
      color: '#e2ca7a', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    const emaSlowSeries = chart.addSeries(LineSeries, {
      color: '#71717a', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })

    const markerApi = createSeriesMarkers(series, [])
    let chartInstance: IChartApi | null = chart

    if (data?.length) {
      const normalized = data.map(d => ({
        time: (d.time > 1e10 ? Math.floor(d.time / 1000) : d.time) as UTCTimestamp,
        open:  Number(d.open),
        high:  Number(d.high),
        low:   Number(d.low),
        close: Number(d.close),
      })).filter(d =>
        d.open > 0 && d.high > 0 && d.low > 0 && d.close > 0 &&
        d.high >= d.low &&
        d.high >= d.open &&
        d.high >= d.close
      )

      series.setData(normalized)

      const lastT = normalized[normalized.length - 1].time as number
      setTimeout(() => {
        if (!chartInstance) return
        try {
          chartInstance.timeScale().setVisibleRange({
            from: (lastT - 90 * 24 * 60 * 60) as UTCTimestamp,
            to: (lastT + 86400) as UTCTimestamp,
          })
        } catch (e) {}
      }, 800)

      if (trades.length) {
        const lastNormT = (normalized[normalized.length - 1]?.time as number) ?? 0
        const cutoff = lastNormT - 90 * 24 * 60 * 60
        const allMarkers = trades.map(t => ({
          time: toSec(t.time) as UTCTimestamp,
          position: t.dir === 'long' ? 'belowBar' as const : 'aboveBar' as const,
          color: t.win ? '#22C55E' : '#EF4444',
          shape: t.dir === 'long' ? 'arrowUp' as const : 'arrowDown' as const,
          text: t.pnlPips != null ? `${t.pnlPips > 0 ? '+' : ''}${t.pnlPips.toFixed(0)}p` : `${t.win ? '+' : ''}${(t.pnlPct * 100).toFixed(0)}%`,
          size: 1,
        }))
        const recentMarkers = allMarkers.filter(m => (m.time as number) >= cutoff)
        markerApi.setMarkers(recentMarkers)
      }
    }

    emaFastSeries.applyOptions({ visible: showEma })
    emaSlowSeries.applyOptions({ visible: showEma })
    if (showEma && emaFastData.length) {
      emaFastSeries.setData(emaFastData.map(d => ({ ...d, time: toSec(d.time) as UTCTimestamp })))
      emaSlowSeries.setData(emaSlowData.map(d => ({ ...d, time: toSec(d.time) as UTCTimestamp })))
    }

    return () => {
      chartInstance = null
      try { chart.remove() } catch (e) { /* already disposed */ }
    }
  }, [data, trades, emaFastData, emaSlowData, showEma])

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />
}
