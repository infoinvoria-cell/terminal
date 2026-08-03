'use client'
import { useEffect, useRef } from 'react'
import {
  createChart, CandlestickSeries, LineSeries, createSeriesMarkers,
  type UTCTimestamp, type IChartApi, type ISeriesApi, type IPriceLine,
} from 'lightweight-charts'

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

function toSec(t: number): number { return t > 1e10 ? Math.floor(t / 1000) : t }

export default function LWChart({
  data, trades = [], emaFastData = [], emaSlowData = [],
  showEma = false, showEmaFast = true, showEmaSlow = true,
  visibleDays = 7, priceLines = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const candleRef    = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const emaFastRef   = useRef<ISeriesApi<'Line'> | null>(null)
  const emaSlowRef   = useRef<ISeriesApi<'Line'> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef    = useRef<{ setMarkers: (m: any[]) => void } | null>(null)
  const plRefs       = useRef<IPriceLine[]>([])
  const visTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Chart created ONCE — never recreated on data changes ───────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      width:  container.clientWidth  || 800,
      height: container.clientHeight || 400,
      layout: {
        background: { color: 'transparent' },
        textColor: '#888888',
        fontSize: 10,
        attributionLogo: false,
        fontFamily: 'var(--font-text)',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)', style: 1 },
        horzLines: { color: 'rgba(255,255,255,0.03)', style: 1 },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#333333', width: 1, style: 3, labelBackgroundColor: '#1A1A1A' },
        horzLine: { color: '#333333', width: 1, style: 3, labelBackgroundColor: '#1A1A1A' },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale:  { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
      timeScale: {
        borderColor: '#2A2A2A',
        borderVisible: true,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        minBarSpacing: 2,
      },
      rightPriceScale: {
        borderColor: '#2A2A2A',
        borderVisible: true,
        scaleMargins: { top: 0.08, bottom: 0.08 },
        autoScale: true,
      },
    })

    chartRef.current = chart

    const candles = chart.addSeries(CandlestickSeries, {
      upColor:        '#FFFFFF',
      downColor:      '#C9A84C',
      borderUpColor:  '#FFFFFF',
      borderDownColor:'#C9A84C',
      wickUpColor:    '#BBBBBB',
      wickDownColor:  '#A08040',
      priceLineVisible: false,
      lastValueVisible: true,
    })
    candleRef.current = candles

    const emaFast = chart.addSeries(LineSeries, { color: '#C9A84C', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    const emaSlow = chart.addSeries(LineSeries, { color: '#555555', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    emaFastRef.current = emaFast
    emaSlowRef.current = emaSlow

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markerRef.current = createSeriesMarkers(candles, []) as any

    // ResizeObserver — debounced 150ms to avoid resize thrash
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(entries => {
      const e = entries[0]
      if (!e || !chartRef.current) return
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        chartRef.current?.resize(e.contentRect.width, e.contentRect.height)
      }, 150)
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      if (resizeTimer)        clearTimeout(resizeTimer)
      if (visTimer.current)   clearTimeout(visTimer.current)
      chartRef.current   = null
      candleRef.current  = null
      emaFastRef.current = null
      emaSlowRef.current = null
      markerRef.current  = null
      plRefs.current     = []
      try { chart.remove() } catch { /* ignore */ }
    }
  }, []) // ← empty deps: chart created ONCE

  // ── Candle data — only reruns when bars change ─────────────────────────
  useEffect(() => {
    const candles = candleRef.current
    const chart   = chartRef.current
    if (!candles || !chart || !data?.length) return

    const normalized = data.map(d => ({
      time:  toSec(d.time) as UTCTimestamp,
      open:  Number(d.open),
      high:  Number(d.high),
      low:   Number(d.low),
      close: Number(d.close),
    })).filter(d => d.open > 0 && d.high >= d.low && d.high >= d.open && d.high >= d.close)

    candles.setData(normalized)

    // rightOffset MUST be set AFTER setData — otherwise it gets overridden
    chart.timeScale().applyOptions({ rightOffset: 8 })

    // Set visible range after a short delay (LWC needs data to be processed)
    if (visTimer.current) clearTimeout(visTimer.current)
    visTimer.current = setTimeout(() => {
      if (!chartRef.current) return
      const lastT  = normalized[normalized.length - 1].time as number
      const firstT = normalized[0].time as number
      const from   = visibleDays === null ? firstT : lastT - visibleDays * 86400
      try {
        chartRef.current.timeScale().setVisibleRange({
          from: from as UTCTimestamp,
          to:   (lastT + 86400) as UTCTimestamp,
        })
      } catch { /* chart may have been removed */ }
    }, 300)
  }, [data, visibleDays])

  // ── Price lines — updated when signal changes (independent of data) ────
  useEffect(() => {
    const candles = candleRef.current
    if (!candles || !data.length) return
    for (const pl of plRefs.current) {
      try { candles.removePriceLine(pl) } catch { /* ignore */ }
    }
    plRefs.current = []
    for (const pl of priceLines) {
      plRefs.current.push(candles.createPriceLine({
        price: pl.price, color: pl.color, lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true, title: pl.label,
      }))
    }
  }, [priceLines, data.length])

  // ── Trade markers ──────────────────────────────────────────────────────
  useEffect(() => {
    const api = markerRef.current
    if (!api) return
    if (!trades.length) { api.setMarkers([]); return }
    api.setMarkers(trades.map(t => ({
      time:     toSec(t.time) as UTCTimestamp,
      position: t.dir === 'long' ? 'belowBar' : 'aboveBar',
      color:    t.win ? '#F5F5F5' : '#9CA3AF',
      shape:    t.dir === 'long' ? 'arrowUp' : 'arrowDown',
      text:     t.pnlPips != null
        ? `${t.pnlPips > 0 ? '+' : ''}${t.pnlPips.toFixed(0)}p`
        : `${t.win ? '+' : ''}${(t.pnlPct * 100).toFixed(0)}%`,
      size: 1,
    })))
  }, [trades])

  // ── EMA series visibility + data ───────────────────────────────────────
  useEffect(() => {
    if (!emaFastRef.current || !emaSlowRef.current) return
    emaFastRef.current.applyOptions({ visible: showEma && showEmaFast })
    emaSlowRef.current.applyOptions({ visible: showEma && showEmaSlow })
    if (showEma && emaFastData.length) {
      emaFastRef.current.setData(emaFastData.map(d => ({ ...d, time: toSec(d.time) as UTCTimestamp })))
      if (emaSlowData.length) {
        emaSlowRef.current.setData(emaSlowData.map(d => ({ ...d, time: toSec(d.time) as UTCTimestamp })))
      }
    }
  }, [emaFastData, emaSlowData, showEma, showEmaFast, showEmaSlow])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: '#0a0a0c' }} />
}
