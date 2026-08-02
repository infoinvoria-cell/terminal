'use client'
import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers, type UTCTimestamp, type IChartApi } from 'lightweight-charts'

interface OhlcBar { time: number; open: number; high: number; low: number; close: number }
interface Trade { time: number; win: boolean; dir: string; pnlPct: number; pnlPips?: number }
interface PriceLine { price: number; color: string; label: string }

interface Props {
  data: OhlcBar[]
  trades?: Trade[]
  emaFastData?: { time: number; value: number }[]
  emaSlowData?: { time: number; value: number }[]
  showEma?: boolean
  showEmaFast?: boolean
  showEmaSlow?: boolean
  visibleDays?: number | null
  priceLines?: PriceLine[]
}

function toSec(t: number): number {
  if (t > 1e10) return Math.floor(t / 1000)
  return t
}

export default function LWChart({ data, trades = [], emaFastData = [], emaSlowData = [], showEma = false, showEmaFast = true, showEmaSlow = true, visibleDays = 90, priceLines = [] }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return

    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { color: '#090909' },
        textColor: '#9CA3AF',
        fontSize: 10,
        attributionLogo: false,
        fontFamily: 'var(--font-montserrat, system-ui)',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)', style: 1 },
        horzLines: { color: 'rgba(255,255,255,0.03)', style: 1 },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#333333', width: 1, style: 3, labelBackgroundColor: '#1c1d20' },
        horzLine: { color: '#333333', width: 1, style: 3, labelBackgroundColor: '#1c1d20' },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
      timeScale: {
        borderColor: '#2A2A2A',
        borderVisible: true,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        minBarSpacing: 2,
      },
      rightPriceScale: {
        borderColor: '#2A2A2A',
        borderVisible: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        autoScale: true,
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#F5F5F5',
      downColor: '#F5F5F5',
      borderUpColor: '#F5F5F5',
      borderDownColor: '#6B7280',
      wickUpColor: '#9CA3AF',
      wickDownColor: '#9CA3AF',
    })

    const emaFastSeries = chart.addSeries(LineSeries, {
      color: '#e2ca7a', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    const emaSlowSeries = chart.addSeries(LineSeries, {
      color: '#555555', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
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

      for (const pl of priceLines) {
        series.createPriceLine({
          price: pl.price,
          color: pl.color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: pl.label,
        })
      }

      const lastT = normalized[normalized.length - 1].time as number
      const firstT = normalized[0].time as number
      setTimeout(() => {
        if (!chartInstance) return
        try {
          const from = visibleDays === null ? firstT : lastT - visibleDays * 86400
          chartInstance.timeScale().setVisibleRange({
            from: from as UTCTimestamp,
            to: (lastT + 86400) as UTCTimestamp,
          })
        } catch {}
      }, 1000)

      if (trades.length) {
        const allMarkers = trades.map(t => ({
          time: toSec(t.time) as UTCTimestamp,
          position: t.dir === 'long' ? 'belowBar' as const : 'aboveBar' as const,
          color: t.win ? '#F5F5F5' : '#9CA3AF',
          shape: t.dir === 'long' ? 'arrowUp' as const : 'arrowDown' as const,
          text: t.pnlPips != null ? `${t.pnlPips > 0 ? '+' : ''}${t.pnlPips.toFixed(0)}p` : `${t.win ? '+' : ''}${(t.pnlPct * 100).toFixed(0)}%`,
          size: 1,
        }))
        markerApi.setMarkers(allMarkers)
      }
    }

    emaFastSeries.applyOptions({ visible: showEma && showEmaFast })
    emaSlowSeries.applyOptions({ visible: showEma && showEmaSlow })
    if (showEma && emaFastData.length) {
      emaFastSeries.setData(emaFastData.map(d => ({ ...d, time: toSec(d.time) as UTCTimestamp })))
      emaSlowSeries.setData(emaSlowData.map(d => ({ ...d, time: toSec(d.time) as UTCTimestamp })))
    }

    return () => {
      chartInstance = null
      try { chart.remove() } catch {}
    }
  }, [data, trades, emaFastData, emaSlowData, showEma, showEmaFast, showEmaSlow, visibleDays, priceLines])

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />
}
