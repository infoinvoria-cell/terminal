'use client'

/**
 * Engine Candlestick Chart — UTC-native pipeline
 *
 * Timestamps everywhere are pure UTC epoch seconds (no Berlin-offset baked in).
 * LWC localisation.timeFormatter formats them to Europe/Berlin for the X-axis.
 *
 * Current bucket is determined EXCLUSIVELY from the provider timestamp of the
 * live quote.  Browser Date.now() is never used as a bucket indicator.
 *
 * OHLC rules
 *   open  = first tick of the bucket (seeded from monitoring bar open)
 *   high  = running maximum of real ticks received after mount
 *   low   = running minimum of real ticks received after mount
 *   close = last tick received
 *   Never uses session high/low from live_quotes (stuck-session-extreme bug)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
  ColorType,
  TickMarkType,
  type UTCTimestamp,
  type ISeriesApi,
} from 'lightweight-charts'
import {
  buildLivePriceAxisLabel,
  candleCloseTone,
  formatAxisPrice,
  PRICE_AXIS_TEXT_COLOR,
  priceAxisBackgroundColor,
  priceAxisGuideStrokeColor,
  priceAxisLabelBorderColor,
  priceAxisLabelShadowColor,
  type CandleCloseTone,
} from '@/lib/monitoring/candleCloseCountdown'
import { useLiveQuotesContext } from '@/contexts/LiveQuotesContext'
import type { SignalData } from '@/lib/engine-client'
import { LiveBarAccumulator, normalizeToSlot, providerBucketUtc as providerBucketUtcFromTs } from '@/lib/engine/bar-aggregation'

// ─── Props ────────────────────────────────────────────────────────────────────

interface OhlcBar { time: number; open: number; high: number; low: number; close: number }
interface Trade   { time: number; win: boolean; dir: string; pnlPct: number; pnlPips?: number }

interface Props {
  data:         OhlcBar[]
  signal?:      SignalData
  trades?:      Trade[]
  emaFastData?: { time: number; value: number }[]
  emaSlowData?: { time: number; value: number }[]
  showEma?:     boolean
  showEmaFast?: boolean
  showEmaSlow?: boolean
  visibleDays?: number | null
  initialBars?: number
  liveSymbol:   string
  timeframe:    string
  symbol:       string
  name:         string
  exchange:     string
  icon:         string
  priceDecimals?: number
  onLivePriceUpdate?: (providerPrice: number, openBarClose: number) => void
  onLiveDiagnostics?: (stats: {
    tickCount: number
    dupTicks: number
    oooTicks: number
    currentBucketSec: number
  }) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD            = '#C9A84C'
const FONT            = "var(--font-montserrat, 'Montserrat', sans-serif)"
const FONT_NUNITO     = "var(--font-nunito, 'Nunito', sans-serif)"
const MONITORING_FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"
const TIME_AXIS_H     = 32

// ─── Time helpers — all pure UTC, zero Berlin-offset arithmetic ───────────────

function toSec(t: number): number { return t > 1e10 ? Math.floor(t / 1000) : t }

function tfStepSec(tf: string): number {
  const u = tf.toUpperCase()
  const m = /^(\d+)M$/.exec(u); if (m) return Number(m[1]) * 60
  const h = /^(\d+)H$/.exec(u); if (h) return Number(h[1]) * 3600
  return 86400
}

/**
 * Berlin-timezone formatter for LWC crosshair tooltip — full date + time.
 * LWC passes UTC epoch seconds; Intl handles DST automatically.
 */
function berlinTimeFormatter(utcSec: number): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(utcSec * 1000))
}

/**
 * Berlin-timezone formatter for X-axis tick mark labels.
 * Shows time for intraday ticks and date at day/month/year boundaries.
 * Replaces LWC's UTC-based default tick mark labels.
 */
function berlinTickMarkFormatter(time: number, tickMarkType: TickMarkType, _locale: string): string {
  const d = new Date(time * 1000)
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...opts }).format(d)
  switch (tickMarkType) {
    case TickMarkType.Year:        return fmt({ year: 'numeric' })
    case TickMarkType.Month:       return fmt({ month: 'short', year: 'numeric' })
    case TickMarkType.DayOfMonth:  return fmt({ day: '2-digit', month: 'short' })
    case TickMarkType.Time:
    case TickMarkType.TimeWithSeconds:
    default:                       return fmt({ hour: '2-digit', minute: '2-digit' })
  }
}

function getPriceAxisWidth(chart: ReturnType<typeof createChart>): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (chart as any).priceScale('right').width() as number
    return w > 10 ? w : 65
  } catch { return 65 }
}

function StrategyChip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button type="button" onClick={onToggle}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block', border: 'none', background: 'none', padding: 0, cursor: 'pointer',
        fontFamily: FONT, fontSize: 11, fontWeight: 500,
        color: active
          ? hovered ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)'
          : hovered ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.22)',
        transition: 'color 140ms ease', whiteSpace: 'nowrap', textAlign: 'left',
        lineHeight: 1.4, userSelect: 'none',
      }}>
      {label}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LWChart({
  data, signal, trades = [],
  emaFastData = [], emaSlowData = [],
  showEma = false, showEmaFast = true, showEmaSlow = true,
  visibleDays = 7,
  initialBars,
  liveSymbol, timeframe, symbol, name, exchange, icon,
  priceDecimals = 4,
  onLivePriceUpdate,
  onLiveDiagnostics,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const headerRef    = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef     = useRef<ReturnType<typeof createChart> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef    = useRef<any>(null)
  const emaFastRef   = useRef<ISeriesApi<'Line'> | null>(null)
  const emaSlowRef   = useRef<ISeriesApi<'Line'> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersPluginRef = useRef<any>(null)
  const visTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataRef       = useRef(data)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveQuoteRef  = useRef<any>(null)
  const signalRef     = useRef(signal)
  const timeframeRef  = useRef(timeframe)
  // Last provider timestamp processed — skip duplicate ticks
  const lastTickTsRef = useRef<string | null>(null)
  // Counter for diagnostic tick logging (first 20 ticks per mount)
  const tickLogCountRef = useRef(0)
  // Live diagnostics counters (reset on bucket transition)
  const liveBucketSecRef  = useRef<number>(0)
  const liveTickCountRef  = useRef<number>(0)
  const dupTickCountRef   = useRef<number>(0)
  const oooTickCountRef   = useRef<number>(0)
  const lastEpochSecRef   = useRef<number>(0)

  const [pluginReady,     setPluginReady]     = useState(0)
  const [signalTriangles, setSignalTriangles] = useState<Array<{ x: number; y: number; dir: 'up' | 'down'; color: string; name: string }>>([])
  const [signalLevels,    setSignalLevels]    = useState<Array<{ x: number; y: number; color: string; label: string }>>([])
  const [exitTriangles,   setExitTriangles]   = useState<Array<{ x: number; y: number }>>([])
  const [tradeLines,      setTradeLines]      = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([])
  const [activeTradeBg,   setActiveTradeBg]   = useState<Set<string>>(new Set())
  const activeTradeBgRef = useRef<Set<string>>(new Set())
  const [tradeBgRects,    setTradeBgRects]    = useState<Array<{ xStart: number; xEnd: number; yEntry: number; ySL: number; yBE: number; yTP: number }>>([])

  // Live bar OHLC accumulator
  const liveAccRef = useRef(new LiveBarAccumulator())

  // Stable DOM refs for price overlay — direct attribute updates, no React re-render per tick
  const priceGuideElRef      = useRef<SVGSVGElement>(null)
  const priceLineElRef       = useRef<SVGLineElement>(null)
  const priceLabelElRef      = useRef<HTMLDivElement>(null)
  const priceLabelPriceRef   = useRef<HTMLSpanElement>(null)
  const priceLabelCountRef   = useRef<HTMLSpanElement>(null)
  // Provider time anchor for monotonic countdown — updated on each real tick
  const providerAnchorSecRef = useRef<number | null>(null)
  const localAnchorMsRef     = useRef<number | null>(null)

  const syncSignalTrianglesRef = useRef<() => void>(() => {})
  const [headerSize,  setHeaderSize]  = useState<{ w: number; h: number } | null>(null)
  const [showStrategies, setShowStrategies] = useState(true)
  const [activeStrategies, setActiveStrategies] = useState<Set<string>>(new Set(['Signal']))

  const { getQuote } = useLiveQuotesContext()
  const liveQuote = getQuote(liveSymbol)

  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { liveQuoteRef.current = liveQuote }, [liveQuote])
  useEffect(() => { signalRef.current = signal }, [signal])
  useEffect(() => { timeframeRef.current = timeframe }, [timeframe])

  const hasSignal = !!signal && signal.direction !== 'flat' && signal.entry != null && signal.sl != null
  const signalDir = signal?.direction as 'long' | 'short' | undefined

  // ── Header resize observer ────────────────────────────────────────────────

  useEffect(() => {
    const el = headerRef.current; if (!el) return
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setHeaderSize({ w: r.width, h: r.height }) })
    ro.observe(el)
    const r = el.getBoundingClientRect(); setHeaderSize({ w: r.width, h: r.height })
    return () => ro.disconnect()
  }, [])

  // ── syncOverlay — price line + label, pure UTC coordinates ───────────────

  const syncOverlay = useCallback(() => {
    const chart     = chartRef.current
    const series    = seriesRef.current
    const container = containerRef.current
    const data      = dataRef.current
    const liveQ     = liveQuoteRef.current
    const tf        = timeframeRef.current
    if (!chart || !series || !container || !data.length) {
      const g = priceGuideElRef.current; if (g) g.style.display = 'none'
      const l = priceLabelElRef.current; if (l) l.style.display = 'none'
      return
    }

    const stepSec   = tfStepSec(tf)
    const lastBar   = data[data.length - 1]
    const liveClose = liveQ?.close ?? lastBar.close

    // Current bar coordinates — accumulator's UTC bucket (never browser time)
    const accSnap       = liveAccRef.current.snapshot()
    const currentBucket = accSnap?.barUtcSec ?? null
    const lastBarUtc    = normalizeToSlot(toSec(lastBar.time), stepSec)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceY = series.priceToCoordinate(liveClose) as any
    if (priceY == null || !Number.isFinite(Number(priceY))) {
      const g = priceGuideElRef.current; if (g) g.style.display = 'none'
      const l = priceLabelElRef.current; if (l) l.style.display = 'none'
      return
    }

    const priceAxisW = getPriceAxisWidth(chart)
    const w  = container.clientWidth
    const x2 = w - priceAxisW

    // Anchor at current bar's x-coordinate; fall back to last closed bar
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentBarX = currentBucket != null ? chart.timeScale().timeToCoordinate(currentBucket as any) as any : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastBarX    = chart.timeScale().timeToCoordinate(lastBarUtc as any) as any
    const anchorX = (currentBarX != null && Number.isFinite(Number(currentBarX)) && Number(currentBarX) > 0 && Number(currentBarX) < x2)
      ? Number(currentBarX)
      : (lastBarX != null && Number.isFinite(Number(lastBarX)) && Number(lastBarX) > 0 && Number(lastBarX) < x2)
        ? Number(lastBarX)
        : null
    const MIN_LINE_PX = 40
    const x1 = Math.max(0, anchorX != null ? Math.min(anchorX, x2 - MIN_LINE_PX) : x2 - MIN_LINE_PX)

    const liveOpen  = accSnap?.open ?? lastBar.close
    const barTimeMs = (currentBucket ?? lastBarUtc) * 1000

    // Monotonic provider-time countdown — avoids browser-time drift on delayed feeds.
    // providerAnchorSecRef stores the exchange event epoch at last tick;
    // performance.now() delta advances provider time between polls.
    const provAnchor  = providerAnchorSecRef.current
    const localAnchor = localAnchorMsRef.current
    const provNowMs   = (provAnchor != null && localAnchor != null)
      ? (provAnchor + (performance.now() - localAnchor) / 1000) * 1000
      : undefined

    const label = buildLivePriceAxisLabel({ barTime: barTimeMs, open: liveOpen, close: liveClose, timeframe: tf, nowMs: provNowMs })
    const tone  = label?.tone ?? candleCloseTone(liveOpen, liveClose)

    // Update DOM directly — stable elements, no React re-render per tick
    const lineEl  = priceLineElRef.current
    const guideEl = priceGuideElRef.current
    const labelEl = priceLabelElRef.current
    if (lineEl && guideEl) {
      lineEl.setAttribute('x1', String(x1))
      lineEl.setAttribute('y1', String(Number(priceY)))
      lineEl.setAttribute('x2', String(x2))
      lineEl.setAttribute('y2', String(Number(priceY)))
      lineEl.setAttribute('stroke', priceAxisGuideStrokeColor(tone))
      guideEl.style.display = ''
    }
    if (labelEl) {
      labelEl.style.display    = 'flex'
      labelEl.style.top        = `${Number(priceY)}px`
      labelEl.style.left       = `${x2}px`
      labelEl.style.width      = `${priceAxisW}px`
      labelEl.style.background = label?.backgroundColor ?? priceAxisBackgroundColor(tone)
      labelEl.style.border     = `1px solid ${priceAxisLabelBorderColor(tone)}`
      labelEl.style.boxShadow  = `0 0 0 1px ${priceAxisLabelShadowColor(tone)}, 0 2px 8px rgba(0,0,0,0.38)`
      labelEl.setAttribute('data-tone', tone)
      if (priceLabelPriceRef.current) {
        priceLabelPriceRef.current.textContent = label?.priceText ?? formatAxisPrice(liveClose)
      }
      const cntEl = priceLabelCountRef.current
      if (cntEl) {
        // When no real provider timestamp is available (anonymous TV = 15-min delayed, lp_time = null),
        // show "Delayed" instead of a browser-time countdown that implies live data.
        const countdownDisplay = provNowMs == null ? 'Delayed' : (label?.countdownText ?? null)
        if (countdownDisplay) {
          cntEl.textContent = countdownDisplay
          cntEl.style.display = ''
          // Gold (bull) background needs dark timer text for legibility
          cntEl.style.color = tone === 'bull' ? 'rgba(0,0,0,0.78)' : '#9CA3AF'
        } else { cntEl.style.display = 'none' }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { syncOverlay() }, [data, syncOverlay])

  // ── Live bar — accumulate OHLC from real ticks ────────────────────────────

  useEffect(() => {
    const series = seriesRef.current
    const tf     = timeframeRef.current
    if (!series) return
    const liveQ = liveQuoteRef.current
    if (!liveQ?.close) return

    // Only the real exchange/provider event timestamp is accepted.
    // updated_at is the DB insert time (≈ browser time) — using it would create
    // phantom future candles when the feed is delayed.
    const provTs = liveQ.timestamp   // exchange event time only — no updated_at fallback
    if (!provTs) return              // no real event timestamp → no candle update
    if (provTs === lastTickTsRef.current) { dupTickCountRef.current++; return }  // duplicate tick
    lastTickTsRef.current = provTs

    const stepSec   = tfStepSec(tf)
    const epochSec  = Math.floor(new Date(provTs).getTime() / 1000)
    if (!Number.isFinite(epochSec) || epochSec <= 0) return

    if (lastEpochSecRef.current > 0 && epochSec < lastEpochSecRef.current) {
      oooTickCountRef.current++
    }
    lastEpochSecRef.current = epochSec

    const tickPrice = liveQ.close
    const bar = liveAccRef.current.update(tickPrice, epochSec, stepSec)

    // Bucket transition — reset per-bucket counters
    if (bar.barUtcSec !== liveBucketSecRef.current) {
      liveBucketSecRef.current = bar.barUtcSec
      liveTickCountRef.current = 0
    }
    liveTickCountRef.current++

    // Store provider time anchor for monotonic countdown (avoids browser-time drift)
    providerAnchorSecRef.current = epochSec
    localAnchorMsRef.current     = performance.now()

    // Strict OHLC invariant
    if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
      console.error('[LWChart] OHLC invariant violated — dropping tick', bar)
      return
    }

    // Diagnostic: first 20 ticks per mount
    if (tickLogCountRef.current < 20) {
      tickLogCountRef.current++
      const n = tickLogCountRef.current
      const bucketBerlin = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit',
      }).format(new Date(bar.barUtcSec * 1000))
      const tickBerlin = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(new Date(epochSec * 1000))
      console.groupCollapsed(`[LWChart tick ${n}/20] ${liveQ.symbol} provTs=${provTs.slice(11,19)}`)
      console.table({
        providerEventTs:  provTs,                                       // exchange event time (bucket source)
        dbUpdatedAt:      liveQ.updated_at ?? '—',                      // DB insert time — NOT used
        tickUTC:          new Date(epochSec * 1000).toISOString(),
        tickBerlin,
        tickPrice:        tickPrice.toFixed(5),
        bucketStartUTC:   new Date(bar.barUtcSec * 1000).toISOString(),
        bucketBerlin,
        bar_open:         bar.open.toFixed(5),
        bar_high:         bar.high.toFixed(5),
        bar_low:          bar.low.toFixed(5),
        bar_close:        bar.close.toFixed(5),
      })
      console.groupEnd()
    }

    try {
      // Pure UTC bucket-start timestamp — LWC's timeFormatter displays it as Berlin time
      series.update({ time: bar.barUtcSec as UTCTimestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close })
    } catch { /* series may be mid-recreate */ }

    if (onLivePriceUpdate && liveQ?.close != null) {
      onLivePriceUpdate(liveQ.close, bar.close)
    }

    if (onLiveDiagnostics) {
      onLiveDiagnostics({
        tickCount:        liveTickCountRef.current,
        dupTicks:         dupTickCountRef.current,
        oooTicks:         oooTickCountRef.current,
        currentBucketSec: liveBucketSecRef.current,
      })
    }

    syncOverlay()
    syncSignalTrianglesRef.current()
  }, [liveQuote, syncOverlay, onLivePriceUpdate, onLiveDiagnostics])

  // ── syncSignalTriangles ───────────────────────────────────────────────────

  const syncSignalTriangles = useCallback(() => {
    const chart  = chartRef.current
    const series = seriesRef.current
    const data   = dataRef.current
    const sig    = signalRef.current
    const tf     = timeframeRef.current
    const hasLevels = !!sig && sig.entry != null && sig.sl != null
    const hasEntry  = hasLevels && (sig!.direction === 'long' || sig!.direction === 'short')
    if (!chart || !series || !showStrategies || !hasLevels || !data.length) {
      setSignalTriangles([]); setSignalLevels([]); setExitTriangles([]); setTradeLines([]); setTradeBgRects([])
      return
    }
    if (!activeStrategies.has('Signal')) {
      setSignalTriangles([]); setSignalLevels([]); setExitTriangles([]); setTradeLines([]); setTradeBgRects([])
      return
    }

    const stepSec = tfStepSec(tf)
    const lastBar = data[data.length - 1]
    const entry   = sig!.entry!
    const sl      = sig!.sl!
    const dir     = (sig!.direction === 'long' || sig!.direction === 'short') ? sig!.direction : 'long'
    const risk    = Math.abs(entry - sl)
    const tp      = sig!.tp != null ? sig!.tp : (dir === 'long' ? entry + risk * 3 : entry - risk * 3)
    const be      = dir === 'long' ? entry + risk : entry - risk
    const levels  = { entry, sl, be, tp }

    // Current bar time: accumulator bucket → pure UTC
    const accSnap    = liveAccRef.current.snapshot()
    const currentUtc = accSnap?.barUtcSec ?? normalizeToSlot(toSec(lastBar.time), stepSec)
    const lastBarUtc = normalizeToSlot(toSec(lastBar.time), stepSec)
    const barTimeSec = currentUtc > lastBarUtc ? currentUtc : lastBarUtc

    const triangles: typeof signalTriangles = []
    if (hasEntry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x = chart.timeScale().timeToCoordinate(barTimeSec as any) as any
      const bodyBottom = Math.min(lastBar.open, lastBar.close)
      const bodyTop    = Math.max(lastBar.open, lastBar.close)
      const bodyRange  = bodyTop - bodyBottom
      const priceGap   = Math.max(bodyRange * 1.1, lastBar.close * 0.0015)
      const refPrice   = dir === 'long' ? bodyBottom - priceGap : bodyTop + priceGap
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y = series.priceToCoordinate(refPrice) as any
      if (x != null && y != null && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
        triangles.push({ x: Number(x), y: Number(y), dir: dir === 'long' ? 'up' : 'down', color: dir === 'long' ? '#22C55E' : '#EF4444', name: 'Signal' })
      }
    }
    setSignalTriangles(triangles)

    const chartW = containerRef.current?.clientWidth ?? 0
    const chartH = (containerRef.current?.clientHeight ?? 9999) - TIME_AXIS_H
    const svgLevels: typeof signalLevels = []
    const lx = Math.max(chartW - 80, 8)
    if (chartW > 0) {
      const items: [number, string, string][] = [
        [levels.tp,    '#22C55E', 'TP'],
        [levels.be,    '#3B82F6', 'BE'],
        [levels.entry, '#06B6D4', 'Entry'],
        [levels.sl,    '#EF4444', 'SL'],
      ]
      for (const [price, color, label] of items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ly = series.priceToCoordinate(price as any) as any
        if (ly == null || !Number.isFinite(Number(ly))) continue
        if (Number(ly) < 0 || Number(ly) > chartH) continue
        svgLevels.push({ x: Number(lx), y: Number(ly), color, label })
      }
    }
    setSignalLevels(svgLevels)
    setExitTriangles([])
    setTradeLines([])

    const bgs: typeof tradeBgRects = []
    if (activeTradeBgRef.current.has('Signal')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xStart = Number(chart.timeScale().timeToCoordinate(barTimeSec as any))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xEnd   = Number(chart.timeScale().timeToCoordinate((barTimeSec + stepSec * 5) as any))
      if (Number.isFinite(xStart) && Number.isFinite(xEnd)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const yEntry = Number(series.priceToCoordinate(levels.entry as any))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ySL    = Number(series.priceToCoordinate(levels.sl as any))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const yBE    = Number(series.priceToCoordinate(levels.be as any))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const yTP    = Number(series.priceToCoordinate(levels.tp as any))
        if ([yEntry, ySL, yBE, yTP].every(v => Number.isFinite(v))) {
          bgs.push({ xStart, xEnd, yEntry, ySL, yBE, yTP })
        }
      }
    }
    setTradeBgRects(bgs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStrategies, activeStrategies, activeTradeBg])

  useEffect(() => { syncSignalTrianglesRef.current = syncSignalTriangles }, [syncSignalTriangles])
  useEffect(() => { syncSignalTriangles() }, [showStrategies, activeStrategies, pluginReady, activeTradeBg, syncSignalTriangles])

  const toggleTradeBg = useCallback((name: string) => {
    setActiveTradeBg(prev => {
      const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name)
      activeTradeBgRef.current = next; return next
    })
  }, [])

  // ── LWC chart creation ────────────────────────────────────────────────────

  useEffect(() => {
    if (!data.length) return
    const container = containerRef.current; if (!container) return

    const stepSec  = tfStepSec(timeframe)
    const liveQ    = liveQuoteRef.current

    // ── 1. Normalise all timestamps to bucket-start UTC ──────────────────
    // Input bars may carry bar-end times (12:29:59) or bar-start times (12:30:00).
    // normalizeToSlot always produces a valid bucket-start (minute ∈ {0, 30} for 30M).
    type NBar = { _utc: number; open: number; high: number; low: number; close: number }
    const allNorm: NBar[] = []
    for (const d of data) {
      const rawSec  = toSec(d.time)
      const slotSec = normalizeToSlot(rawSec, stepSec)
      if (slotSec <= 0 || !Number.isFinite(slotSec)) { console.warn('[LWChart] invalid timestamp, skipped', d.time); continue }
      const open = Number(d.open), high = Number(d.high), low = Number(d.low), close = Number(d.close)
      if (open <= 0 || high < low) { console.warn('[LWChart] invalid OHLC, skipped', d); continue }
      allNorm.push({ _utc: slotSec, open, high, low, close })
    }
    // Sort ascending, deduplicate by slot (last value wins for each slot)
    allNorm.sort((a, b) => a._utc - b._utc)
    const dedupMap = new Map<number, NBar>()
    for (const b of allNorm) dedupMap.set(b._utc, b)
    const sorted = [...dedupMap.values()].sort((a, b) => a._utc - b._utc)
    if (!sorted.length) return

    // ── 2. Determine current bucket from EXCHANGE EVENT TIMESTAMP only ───
    // Returns null when no real provider timestamp is available yet.
    // In that case ALL bars are shown as closed history — no phantom candle.
    const currentBucket = providerBucketUtcFromTs(liveQ?.timestamp, stepSec)

    // Bars whose slot < currentBucket are closed history.
    // If currentBucket is null (no live quote yet) all bars are history.
    const closedBars = currentBucket != null
      ? sorted.filter(b => b._utc < currentBucket)
      : sorted
    const currentMonBar = currentBucket != null
      ? sorted.find(b => b._utc === currentBucket) ?? null
      : null

    if (!closedBars.length && !currentMonBar) return

    // ── 3. Create chart ──────────────────────────────────────────────────
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.VerticalGradient, topColor: '#17171b', bottomColor: '#0b0b0e' },
        textColor: 'rgba(200, 200, 200, 0.85)',
        fontFamily: FONT,
        fontSize: 11,
        attributionLogo: false,
      },
      localization: {
        // Display UTC epoch seconds as Europe/Berlin time on the X-axis.
        // No Berlin offset is baked into any stored timestamp.
        timeFormatter: berlinTimeFormatter,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(180,180,180,0.45)', width: 1, style: LineStyle.LargeDashed, labelVisible: true, labelBackgroundColor: '#2a2d35' },
        horzLine: { color: 'rgba(180,180,180,0.45)', width: 1, style: LineStyle.LargeDashed, labelVisible: true, labelBackgroundColor: '#2a2d35' },
      },
      rightPriceScale: { visible: true, borderVisible: false, autoScale: true, scaleMargins: { top: 0.08, bottom: 0.06 } },
      leftPriceScale:  { visible: false },
      timeScale: {
        visible: true, borderVisible: false, timeVisible: true, secondsVisible: false,
        minimumHeight: TIME_AXIS_H, fixLeftEdge: false, fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false, rightOffset: 10,
        tickMarkFormatter: berlinTickMarkFormatter,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale:  { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      kineticScroll: { mouse: false, touch: false },
    })
    chartRef.current = chart

    const minMove = Math.pow(10, -priceDecimals)
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#ffffff', downColor: GOLD,
      borderUpColor: '#ffffff', borderDownColor: GOLD,
      wickUpColor: '#ffffff', wickDownColor: GOLD,
      priceLineVisible: false, lastValueVisible: false,
      priceFormat: { type: 'price', precision: priceDecimals, minMove },
    })
    seriesRef.current = series

    // ── 4. setData: closed bars + future whitespace timepoints ──────────
    // Whitespace entries carry only `time` — no OHLC, invisible on chart,
    // but they extend the X-axis so future time labels appear in the right-offset area.
    // They are NEVER passed to Python or treated as market data.
    const lwcBars = closedBars.map(b => ({
      time:  b._utc as UTCTimestamp,
      open:  b.open, high: b.high, low: b.low, close: b.close,
    }))
    series.setData(lwcBars)

    // ── 5. Show current forming bar ──────────────────────────────────────
    // Source-of-truth priority:
    //   1. TV chart series monitoring bar (currentMonBar) — real OHLC from provider
    //   2. LiveBarAccumulator — close-tick range for the current bucket (fallback only)
    // When a TV series bar exists for the current bucket, use it directly.
    // The accumulator still seeds for live-tick refinement within the bucket.
    liveAccRef.current.reset()
    tickLogCountRef.current = 0
    lastTickTsRef.current   = null

    if (currentBucket != null) {
      if (currentMonBar) {
        // TV series bar available — render it immediately as the authoritative current bar.
        // Also seed the accumulator so subsequent ticks can refine H/L within the bucket.
        liveAccRef.current.initFromData(currentMonBar.open, currentBucket)
        try {
          series.update({
            time:  currentBucket as UTCTimestamp,
            open:  currentMonBar.open,
            high:  currentMonBar.high,
            low:   currentMonBar.low,
            close: currentMonBar.close,
          })
        } catch { /* ignore */ }
      } else if (closedBars.length) {
        // No TV series bar yet for current bucket — seed accumulator from last closed bar
        liveAccRef.current.initFromData(closedBars[closedBars.length - 1].close, currentBucket)
      }

      // Apply live quote tick immediately so we don't wait for the 5s poll.
      // Only the real exchange event timestamp is accepted — server time fallback is
      // acceptable here because bucket rounding makes it equivalent for 30M/1H/2H/D.
      const provTs       = liveQ?.timestamp
      const provEpochSec = provTs ? Math.floor(new Date(provTs).getTime() / 1000) : null
      if (liveQ?.close && provTs && provEpochSec != null && Number.isFinite(provEpochSec) && provEpochSec > 0) {
        const tickBar = liveAccRef.current.update(liveQ.close, provEpochSec, stepSec)
        lastTickTsRef.current = provTs
        // Only override with accumulator when no TV series bar is available for this bucket
        if (tickBar && !currentMonBar) {
          try { series.update({ time: tickBar.barUtcSec as UTCTimestamp, open: tickBar.open, high: tickBar.high, low: tickBar.low, close: tickBar.close }) } catch { /* ignore */ }
        }
      }
    }

    // Dev diagnostic
    if (process.env.NODE_ENV === 'development') {
      const nowBerlin = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(new Date())
      const provTs      = liveQ?.timestamp     // exchange event time only
      const updatedAt   = liveQ?.updated_at    // DB insert time — shown separately for comparison
      const fmt = (ts: string | undefined, opts: Intl.DateTimeFormatOptions) =>
        ts ? new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...opts }).format(new Date(ts)) : '—'
      const hms = { hour: '2-digit' as const, minute: '2-digit' as const, second: '2-digit' as const }
      const hm  = { hour: '2-digit' as const, minute: '2-digit' as const }
      const bucketBerlin = currentBucket ? fmt(new Date(currentBucket * 1000).toISOString(), hm) : '—'
      const snap = liveAccRef.current.snapshot()
      console.groupCollapsed('[LWChart mount diagnostic]')
      console.table({
        browserTime:            nowBerlin,
        providerEventTs:        fmt(provTs, hms),        // exchange/provider event time (used for bucket)
        providerEventUTC:       provTs ? new Date(provTs).toISOString().slice(11, 19) : '—',
        dbUpdatedAt:            fmt(updatedAt, hms),     // DB insert time — NOT used for bucket
        dbUpdatedAtUTC:         updatedAt ? new Date(updatedAt).toISOString().slice(11, 19) : '—',
        currentBucketUTC:       currentBucket ? new Date(currentBucket * 1000).toISOString().slice(11, 16) : '—',
        currentBucketBerlin:    bucketBerlin,
        closedBarsCount:        closedBars.length,
        lastClosedBarUTC:       closedBars.length ? new Date(closedBars[closedBars.length - 1]._utc * 1000).toISOString().slice(11, 16) : '—',
        currentBarO:            snap?.open.toFixed(5)  ?? '—',
        currentBarH:            snap?.high.toFixed(5)  ?? '—',
        currentBarL:            snap?.low.toFixed(5)   ?? '—',
        currentBarC:            snap?.close.toFixed(5) ?? '—',
        lastTimestampToLWC:     snap ? new Date(snap.barUtcSec * 1000).toISOString().slice(11, 16) + ' UTC' : '—',
      })
      console.groupEnd()
    }

    // ── 6. EMA lines ─────────────────────────────────────────────────────
    const emaFastSeries = chart.addSeries(LineSeries, { color: GOLD, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    const emaSlowSeries = chart.addSeries(LineSeries, { color: '#555', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    emaFastRef.current = emaFastSeries
    emaSlowRef.current = emaSlowSeries

    // Markers plugin
    markersPluginRef.current = createSeriesMarkers(series)
    setPluginReady(n => n + 1)

    // Initial visible range — +10 right offset gives breathing room to the right
    const totalBars   = closedBars.length
    const visibleBars = initialBars != null
      ? Math.min(closedBars.length, initialBars)
      : visibleDays === null
        ? closedBars.length
        : Math.min(closedBars.length, Math.round(visibleDays * 86400 / stepSec))
    chart.timeScale().setVisibleLogicalRange({ from: totalBars - visibleBars, to: totalBars + 10 })

    // Subscribe
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      requestAnimationFrame(syncOverlay)
      requestAnimationFrame(() => syncSignalTrianglesRef.current())
    })
    chart.subscribeCrosshairMove(() => requestAnimationFrame(syncOverlay))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(chart as any).priceScale('right').subscribeVisiblePriceRangeChange?.(() =>
      requestAnimationFrame(() => syncSignalTrianglesRef.current())
    )

    syncOverlay()
    const timer = setInterval(syncOverlay, 1_000)

    // Cursor
    const onPtrMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const isPlot = e.clientX - rect.left < rect.width - getPriceAxisWidth(chart) && e.clientY - rect.top < rect.height - TIME_AXIS_H
      container.style.cursor = isPlot ? 'crosshair' : ''
    }
    const onPtrLeave = () => { container.style.cursor = '' }
    const clearCross = () => { try { chart.clearCrosshairPosition() } catch { /* ignore */ } }
    container.addEventListener('pointermove', onPtrMove)
    container.addEventListener('pointerleave', onPtrLeave)
    container.addEventListener('mouseleave',  clearCross)
    container.addEventListener('touchend',    clearCross)
    container.addEventListener('touchcancel', clearCross)

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(syncOverlay)
      requestAnimationFrame(() => syncSignalTrianglesRef.current())
    })
    ro.observe(container)

    return () => {
      clearInterval(timer)
      if (visTimerRef.current) clearTimeout(visTimerRef.current)
      ro.disconnect()
      container.removeEventListener('pointermove', onPtrMove)
      container.removeEventListener('pointerleave', onPtrLeave)
      container.removeEventListener('mouseleave',  clearCross)
      container.removeEventListener('touchend',    clearCross)
      container.removeEventListener('touchcancel', clearCross)
      markersPluginRef.current?.detach?.()
      markersPluginRef.current = null
      chartRef.current  = null
      seriesRef.current = null
      emaFastRef.current = null
      emaSlowRef.current = null
      liveAccRef.current.reset()
      tickLogCountRef.current = 0
      lastTickTsRef.current   = null
      try { chart.remove() } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length, timeframe])

  // ── Data update (gap-fill / strategy switch) ──────────────────────────────

  useEffect(() => {
    const series = seriesRef.current
    if (!series || !data.length) return

    const stepSec = tfStepSec(timeframe)
    const liveQ   = liveQuoteRef.current

    type NBar = { _utc: number; open: number; high: number; low: number; close: number }
    const allNorm: NBar[] = []
    for (const d of data) {
      const slotSec = normalizeToSlot(toSec(d.time), stepSec)
      if (slotSec <= 0 || !Number.isFinite(slotSec)) continue
      const open = Number(d.open), high = Number(d.high), low = Number(d.low), close = Number(d.close)
      if (open <= 0 || high < low) continue
      allNorm.push({ _utc: slotSec, open, high, low, close })
    }
    allNorm.sort((a, b) => a._utc - b._utc)
    const dedupMap = new Map<number, NBar>()
    for (const b of allNorm) dedupMap.set(b._utc, b)
    const sorted = [...dedupMap.values()].sort((a, b) => a._utc - b._utc)
    if (!sorted.length) return

    const currentBucket  = providerBucketUtcFromTs(liveQ?.timestamp, stepSec)
    const closedBars     = currentBucket != null ? sorted.filter(b => b._utc < currentBucket) : sorted
    const currentMonBar  = currentBucket != null ? sorted.find(b => b._utc === currentBucket) ?? null : null

    if (!closedBars.length && !currentMonBar) return

    const lwcBars = closedBars.map(b => ({
      time: b._utc as UTCTimestamp,
      open: b.open, high: b.high, low: b.low, close: b.close,
    }))
    series.setData(lwcBars)

    // Re-seed accumulator (no-op if already seeded for this bucket)
    if (currentBucket != null) {
      if (currentMonBar) {
        liveAccRef.current.initFromData(currentMonBar.open, currentBucket)
      } else if (closedBars.length) {
        liveAccRef.current.initFromData(closedBars[closedBars.length - 1].close, currentBucket)
      }
      const snap = liveAccRef.current.snapshot()
      if (snap) {
        try { series.update({ time: snap.barUtcSec as UTCTimestamp, open: snap.open, high: snap.high, low: snap.low, close: snap.close }) } catch { /* ignore */ }
      }
    }

    requestAnimationFrame(syncOverlay)
    requestAnimationFrame(() => syncSignalTrianglesRef.current())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, timeframe, syncOverlay])

  // ── Trade markers ─────────────────────────────────────────────────────────

  useEffect(() => {
    const api = markersPluginRef.current; if (!api) return
    if (!trades.length) { api.setMarkers([]); return }
    const stepSec = tfStepSec(timeframe)
    api.setMarkers(trades.map(t => ({
      time:     normalizeToSlot(toSec(t.time), stepSec) as UTCTimestamp,
      position: t.dir === 'long' ? 'belowBar' : 'aboveBar',
      color:    t.win ? '#F5F5F5' : '#9CA3AF',
      shape:    t.dir === 'long' ? 'arrowUp' : 'arrowDown',
      text:     t.pnlPips != null
        ? `${t.pnlPips > 0 ? '+' : ''}${t.pnlPips.toFixed(0)}p`
        : `${t.win ? '+' : ''}${(t.pnlPct * 100).toFixed(0)}%`,
      size: 1,
    })))
  }, [trades, timeframe])

  // ── EMA lines ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!emaFastRef.current || !emaSlowRef.current) return
    emaFastRef.current.applyOptions({ visible: showEma && showEmaFast })
    emaSlowRef.current.applyOptions({ visible: showEma && showEmaSlow })
    if (showEma && emaFastData.length) {
      const stepSec = tfStepSec(timeframe)
      // Deduplicate by slot before setData — two bars that map to the same slot
      // (e.g. "T24:00:00" vs "T00:00:00" next day) would otherwise throw:
      // "data must be asc ordered by time". Last value per slot wins (TV history).
      const toSlotMap = (data: typeof emaFastData) => {
        const m = new Map<number, number>()
        for (const d of data) m.set(normalizeToSlot(toSec(d.time), stepSec), d.value)
        return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ value: v, time: t as UTCTimestamp }))
      }
      emaFastRef.current.setData(toSlotMap(emaFastData))
      if (emaSlowData.length) emaSlowRef.current.setData(toSlotMap(emaSlowData))
    }
  }, [emaFastData, emaSlowData, showEma, showEmaFast, showEmaSlow, timeframe])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div data-testid="engine-6e30m-source-fixed" style={{ position: 'relative', height: '100%', width: '100%', background: '#0e0e12', overflow: 'hidden' }}>

      <div ref={containerRef} className="monitoring-chart-shell" style={{ position: 'absolute', inset: 0 }} />

      {/* Price guide line — stable DOM element, updated via ref, never remounted */}
      <svg ref={priceGuideElRef}
        style={{ display: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
        <line ref={priceLineElRef} data-price-guide="1"
          x1="0" y1="0" x2="0" y2="0"
          stroke="#ffffff" strokeOpacity={0.92} strokeWidth={1}
          strokeDasharray="3 3" shapeRendering="geometricPrecision" pointerEvents="none" />
      </svg>

      {/* Trade background fills */}
      {tradeBgRects.map((b, i) => {
        const w = b.xEnd - b.xStart
        const slZoneY = Math.min(b.yEntry, b.ySL); const slZoneH = Math.abs(b.ySL - b.yEntry)
        const tpZoneY = Math.min(b.yEntry, b.yTP); const tpZoneH = Math.abs(b.yTP - b.yEntry)
        return (
          <svg key={i} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3, overflow: 'hidden' }}>
            <rect x={b.xStart} y={slZoneY} width={w} height={slZoneH} fill="rgba(239,68,68,0.055)" />
            <rect x={b.xStart} y={tpZoneY} width={w} height={tpZoneH} fill="rgba(34,197,94,0.045)" />
            <line x1={b.xStart} y1={b.ySL}    x2={b.xEnd} y2={b.ySL}    stroke="#EF4444" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3" />
            <line x1={b.xStart} y1={b.yBE}    x2={b.xEnd} y2={b.yBE}    stroke="#3B82F6" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3" />
            <line x1={b.xStart} y1={b.yEntry} x2={b.xEnd} y2={b.yEntry} stroke="#06B6D4" strokeWidth={1} strokeOpacity={0.7} strokeDasharray="3 3" />
            <line x1={b.xStart} y1={b.yTP}    x2={b.xEnd} y2={b.yTP}    stroke="#22C55E" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="3 3" />
          </svg>
        )
      })}

      {/* Signal entry triangles */}
      {signalTriangles.map((t) => {
        const S = 7
        const isActive = activeTradeBg.has(t.name)
        const points = t.dir === 'up'
          ? `${t.x},${t.y - S * 2} ${t.x - S},${t.y} ${t.x + S},${t.y}`
          : `${t.x},${t.y + S * 2} ${t.x - S},${t.y} ${t.x + S},${t.y}`
        return (
          <svg key={t.name} onClick={() => toggleTradeBg(t.name)}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 7, overflow: 'visible', cursor: 'pointer' }}>
            <polygon points={points} fill={t.color} opacity={isActive ? 1 : 0.92}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              stroke={isActive ? 'rgba(255,255,255,0.5)' : 'none'} strokeWidth={isActive ? 1 : 0} />
          </svg>
        )
      })}

      {/* Level arrows */}
      {signalLevels.map((l, i) => {
        const H = 5; const W = 10
        const points = `${l.x - W},${l.y - H} ${l.x - W},${l.y + H} ${l.x},${l.y}`
        return (
          <svg key={i} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6, overflow: 'hidden' }}>
            <polygon points={points} fill={l.color} opacity={0.88} />
          </svg>
        )
      })}

      {/* Trade lines */}
      {tradeLines.map((l, i) => (
        <svg key={i} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }}>
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(160,160,170,0.55)" strokeWidth={1} strokeDasharray="3 4" shapeRendering="geometricPrecision" />
        </svg>
      ))}

      {/* Exit triangles */}
      {exitTriangles.map((t, i) => {
        const H = 6; const W = 11
        const points = `${t.x},${t.y} ${t.x + W},${t.y - H} ${t.x + W},${t.y + H}`
        return (
          <svg key={i} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6, overflow: 'hidden' }}>
            <polygon points={points} fill="#A855F7" opacity={0.9} />
          </svg>
        )
      })}

      {/* Price/countdown label — stable DOM element, updated via ref, never remounted */}
      <div ref={priceLabelElRef} className="monitoring-price-axis-label"
        style={{
          display: 'none', position: 'absolute', left: 0, top: 0, width: 65,
          transform: 'translateY(-50%)', zIndex: 6, pointerEvents: 'none',
          flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
          gap: 1, minHeight: 20, padding: '1px 5px', boxSizing: 'border-box', borderRadius: 3,
          lineHeight: 1, fontFamily: MONITORING_FONT, fontSize: 10,
        }}>
        <span ref={priceLabelPriceRef}
          style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_NUNITO, color: PRICE_AXIS_TEXT_COLOR, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }} />
        <span ref={priceLabelCountRef}
          style={{ fontSize: 10, fontWeight: 400, color: '#9CA3AF', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', display: 'none' }} />
      </div>

      {/* Header blur */}
      {headerSize && (
        <div aria-hidden style={{
          position: 'absolute', top: 0, left: 0,
          width: 12 + headerSize.w + 20, height: 12 + headerSize.h + 16,
          zIndex: 9, pointerEvents: 'none',
          backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)',
          maskImage: 'linear-gradient(135deg, black 50%, transparent 88%)',
          WebkitMaskImage: 'linear-gradient(135deg, black 50%, transparent 88%)',
        }} />
      )}

      {/* Instrument header */}
      <div ref={headerRef} style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        pointerEvents: 'auto', userSelect: 'none',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} alt="" style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: FONT, fontSize: 15, fontWeight: 700, color: '#F5F5F5', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
              <span>{symbol}</span>
              <span style={{ color: '#ffffff', fontWeight: 700 }}>·</span>
              <span style={{ fontFamily: FONT_NUNITO, fontWeight: 700 }}>{timeframe.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.45)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                <span>{name}</span>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
                <span>{exchange}</span>
              </div>
              {hasSignal && (
                <button type="button" onClick={() => setShowStrategies(v => !v)}
                  title={showStrategies ? 'Signal ausblenden' : 'Signal einblenden'}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: showStrategies ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)', transition: 'color 150ms ease', flexShrink: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = showStrategies ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)' }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {showStrategies ? (
                      <>
                        <path d="M8 3C4.5 3 1.5 8 1.5 8s3 5 6.5 5 6.5-5 6.5-5-3-5-6.5-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
                      </>
                    ) : (
                      <>
                        <path d="M2 2l12 12M6.5 6.7A2 2 0 0010.3 10M4.2 4.5C2.8 5.6 1.5 8 1.5 8s3 5 6.5 5c1.4 0 2.7-.5 3.8-1.3M7 3.1C7.3 3 7.7 3 8 3c3.5 0 6.5 5 6.5 5s-.7 1.3-1.9 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </>
                    )}
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {showStrategies && hasSignal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <StrategyChip
              label={`${signalDir === 'long' ? '▲' : '▼'} Signal — ${signalDir?.toUpperCase()}`}
              active={activeStrategies.has('Signal')}
              onToggle={() => setActiveStrategies(prev => {
                const next = new Set(prev); next.has('Signal') ? next.delete('Signal') : next.add('Signal'); return next
              })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
