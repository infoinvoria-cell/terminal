'use client'

/**
 * Engine Candlestick Chart
 * Visual: 1:1 copy of ReferenceCandlestickChart (Referenzen page).
 * Data:   engine bars (port 5000) + live quote from Supabase context.
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
  /** e.g. "6E1!", "FDAX1!" — used for live quote lookup */
  liveSymbol:   string
  /** e.g. "30M", "1H", "2H", "D" — for countdown */
  timeframe:    string
  /** Display symbol, e.g. "6E1!" */
  symbol:       string
  /** Display name, e.g. "EUR/USD Futures" */
  name:         string
  /** Exchange label, e.g. "CME" */
  exchange:     string
  /** Icon path, e.g. "/asset-icons/eur.png" */
  icon:         string
  /** Price decimal places for Y-axis labels, e.g. 4 for EURUSD, 0 for DAX */
  priceDecimals?: number
}

// ─── Constants — identical to ReferenceCandlestickChart ──────────────────────

const GOLD            = '#C9A84C'
const FONT            = "var(--font-montserrat, 'Montserrat', sans-serif)"
const FONT_NUNITO     = "var(--font-nunito, 'Nunito', sans-serif)"
const MONITORING_FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"
const TIME_AXIS_H     = 32
// Berlin CEST offset: chart timestamps are shifted by +2 h so the X-axis reads local time.
// Adjust to 3600 in winter (CET = UTC+1).
const TZ_OFFSET_SEC   = 2 * 3600

// ─── Types (identical to ReferenceCandlestickChart) ──────────────────────────

type PriceLine  = { x1: number; x2: number; y: number; stroke: string }
type PriceLabel = {
  top: number; left: number; width: number
  priceText: string; countdownText: string | null
  tone: CandleCloseTone; backgroundColor: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSec(t: number): number { return t > 1e10 ? Math.floor(t / 1000) : t }

function tfStepSec(tf: string): number {
  const u = tf.toUpperCase()
  const m = /^(\d+)M$/.exec(u); if (m) return Number(m[1]) * 60
  const h = /^(\d+)H$/.exec(u); if (h) return Number(h[1]) * 3600
  return 86400 // daily fallback
}

/** Current open bar's start time as a Berlin-offset display timestamp (for chart coords). */
function currentBarTimeSec(tf: string): number {
  const step = tfStepSec(tf)
  return Math.floor(Date.now() / 1000 / step) * step + TZ_OFFSET_SEC
}

/** Current open bar's start time in UTC seconds (for countdown / boundary logic). */
function currentBarTimeUtc(tf: string): number {
  const step = tfStepSec(tf)
  return Math.floor(Date.now() / 1000 / step) * step
}

/** Whitespace bars from lastTimeSec+step up to today's current bar + 5 extra bars */
function buildFutureBars(lastTimeSec: number, tf: string): { time: number }[] {
  const step    = tfStepSec(tf)
  const target  = currentBarTimeSec(tf) + step * 5   // 5 bars past current bar
  const result: { time: number }[] = []
  let t = lastTimeSec
  while (t < target) { t += step; result.push({ time: t }) }
  return result
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
  liveSymbol, timeframe, symbol, name, exchange, icon,
  priceDecimals = 4,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const headerRef    = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef     = useRef<ReturnType<typeof createChart> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef    = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emaFastRef   = useRef<ISeriesApi<'Line'> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emaSlowRef   = useRef<ISeriesApi<'Line'> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersPluginRef = useRef<any>(null)
  const visTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable refs — initialized to null/empty, synced in effects below
  const dataRef       = useRef(data)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveQuoteRef  = useRef<any>(null)
  const signalRef     = useRef(signal)
  const timeframeRef  = useRef(timeframe)

  // ── State — identical names to ReferenceCandlestickChart ─────────────────
  const [pluginReady,     setPluginReady]     = useState(0)
  const [signalTriangles, setSignalTriangles] = useState<Array<{ x: number; y: number; dir: 'up' | 'down'; color: string; name: string }>>([])
  const [signalLevels,    setSignalLevels]    = useState<Array<{ x: number; y: number; color: string; label: string }>>([])
  const [exitTriangles,   setExitTriangles]   = useState<Array<{ x: number; y: number }>>([])
  const [tradeLines,      setTradeLines]      = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([])
  const [activeTradeBg,   setActiveTradeBg]   = useState<Set<string>>(new Set())
  const activeTradeBgRef = useRef<Set<string>>(new Set())
  const [tradeBgRects,    setTradeBgRects]    = useState<Array<{ xStart: number; xEnd: number; yEntry: number; ySL: number; yBE: number; yTP: number }>>([])
  // Tracks running OHLC of the current live bar across 5-second ticks
  const liveBarRef = useRef<{ time: number; open: number; high: number; low: number } | null>(null)

  const syncSignalTrianglesRef = useRef<() => void>(() => {})
  const [priceLine,   setPriceLine]   = useState<PriceLine | null>(null)
  const [priceLabel,  setPriceLabel]  = useState<PriceLabel | null>(null)
  const [headerSize,  setHeaderSize]  = useState<{ w: number; h: number } | null>(null)
  const [showStrategies, setShowStrategies] = useState(true)
  const [activeStrategies, setActiveStrategies] = useState<Set<string>>(new Set(['Signal']))

  // Live quote
  const { getQuote } = useLiveQuotesContext()
  const liveQuote = getQuote(liveSymbol)

  // Keep refs in sync so callbacks can read latest values without stale closure issues
  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { liveQuoteRef.current = liveQuote }, [liveQuote])
  useEffect(() => { signalRef.current = signal }, [signal])
  useEffect(() => { timeframeRef.current = timeframe }, [timeframe])

  // ── Derived signal values ─────────────────────────────────────────────────

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

  // ── syncOverlay — live price line + label ─────────────────────────────────

  // Use useCallback with empty deps — reads latest values via refs to avoid render loops
  const syncOverlay = useCallback(() => {
    const chart   = chartRef.current
    const series  = seriesRef.current
    const container = containerRef.current
    const data    = dataRef.current
    const liveQ   = liveQuoteRef.current
    const tf      = timeframeRef.current
    if (!chart || !series || !container || !data.length) return

    const lastBar    = data[data.length - 1]
    const liveClose  = liveQ?.close ?? lastBar.close
    // TZ-offset bar time for chart coordinates; UTC bar time for countdown math
    const liveBT     = currentBarTimeSec(tf)
    const liveBT_utc = currentBarTimeUtc(tf)
    const lastBarDisplay = toSec(lastBar.time) + TZ_OFFSET_SEC

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceY = series.priceToCoordinate(liveClose) as any
    if (priceY == null || !Number.isFinite(Number(priceY))) { setPriceLine(null); return }

    const priceAxisW = getPriceAxisWidth(chart)
    const w  = container.clientWidth
    const x2 = w - priceAxisW
    // Anchor price line at current bar position (if visible) else last engine bar
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const liveBarX = chart.timeScale().timeToCoordinate(liveBT as any) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastBarX = chart.timeScale().timeToCoordinate(lastBarDisplay as any) as any
    const anchorX = (liveBarX != null && Number.isFinite(Number(liveBarX)) && Number(liveBarX) > 0 && Number(liveBarX) < x2)
      ? Number(liveBarX)
      : (lastBarX != null && Number.isFinite(Number(lastBarX)) && Number(lastBarX) > 0 && Number(lastBarX) < x2)
        ? Number(lastBarX)
        : null
    const MIN_LINE_PX = 40
    const x1 = Math.max(0, anchorX != null ? Math.min(anchorX, x2 - MIN_LINE_PX) : x2 - MIN_LINE_PX)

    // Open price: use the current bar's actual open (from monitoring data if available)
    const liveOpen = lastBarDisplay === liveBT ? lastBar.open : lastBar.close
    // Pass UTC bar time to countdown (countdown is wall-clock based, not offset-based)
    const label = buildLivePriceAxisLabel({ barTime: liveBT_utc * 1000, open: liveOpen, close: liveClose, timeframe: tf })
    const tone  = label?.tone ?? candleCloseTone(liveOpen, liveClose)

    setPriceLine({ x1, x2, y: Number(priceY), stroke: priceAxisGuideStrokeColor(tone) })
    setPriceLabel({
      top: Number(priceY), left: x2, width: priceAxisW,
      priceText: label?.priceText ?? formatAxisPrice(liveClose),
      countdownText: label?.countdownText ?? null,
      tone, backgroundColor: label?.backgroundColor ?? priceAxisBackgroundColor(tone),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-run syncOverlay when data loads; live quote is handled by the 1s interval
  useEffect(() => { syncOverlay() }, [data, syncOverlay])

  // ── Live bar — push current-bar OHLC into the series on every 5s liveQuote tick ──
  useEffect(() => {
    const series = seriesRef.current
    const d      = dataRef.current
    const tf     = timeframeRef.current
    if (!series || !d.length) return
    const liveQ = liveQuoteRef.current
    if (!liveQ?.close) return

    const liveClose  = liveQ.close
    const step       = tfStepSec(tf)
    const liveBT_utc = Math.floor(Date.now() / 1000 / step) * step  // UTC bar boundary
    const liveBT     = liveBT_utc + TZ_OFFSET_SEC                   // Berlin-offset for chart
    const lastBar    = d[d.length - 1]

    // Reset running OHLC when bar boundary flips, then accumulate across ticks.
    // Never derive high/low from open vs tick alone — that resets on every 5s poll.
    if (!liveBarRef.current || liveBarRef.current.time !== liveBT_utc) {
      const isCurrentInData = toSec(lastBar.time) === liveBT_utc
      const barOpen = isCurrentInData ? lastBar.open : lastBar.close
      liveBarRef.current = { time: liveBT_utc, open: barOpen, high: liveClose, low: liveClose }
    }
    liveBarRef.current.high = Math.max(liveBarRef.current.high, liveClose)
    liveBarRef.current.low  = Math.min(liveBarRef.current.low,  liveClose)

    try {
      series.update({
        time:  liveBT as UTCTimestamp,
        open:  liveBarRef.current.open,
        high:  liveBarRef.current.high,
        low:   liveBarRef.current.low,
        close: liveClose,
      })
    } catch { /* series may not be ready yet */ }

    // Keep overlay in sync with the live bar
    syncOverlay()
    syncSignalTrianglesRef.current()
  }, [liveQuote, syncOverlay])

  // ── syncSignalTriangles — identical logic to ReferenceCandlestickChart ────

  const syncSignalTriangles = useCallback(() => {
    const chart  = chartRef.current
    const series = seriesRef.current
    const data   = dataRef.current
    const sig    = signalRef.current
    const tf     = timeframeRef.current
    // Show levels when entry+sl are known (even when flat = "watching these levels")
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

    const lastBar  = data[data.length - 1]
    const entry    = sig!.entry!
    const sl       = sig!.sl!
    const dir      = (sig!.direction === 'long' || sig!.direction === 'short') ? sig!.direction : 'long'
    const risk     = Math.abs(entry - sl)
    // Use engine TP if provided, otherwise compute 3R target
    const tp       = sig!.tp != null ? sig!.tp : (dir === 'long' ? entry + risk * 3 : entry - risk * 3)
    const be       = dir === 'long' ? entry + risk : entry - risk
    const levels   = { entry, sl, be, tp }
    // Anchor at current live bar time (TZ-offset to match chart timestamps)
    const liveBT   = currentBarTimeSec(tf)
    const lastBarDisplay = toSec(lastBar.time) + TZ_OFFSET_SEC
    const barTimeSec = liveBT > lastBarDisplay ? liveBT : lastBarDisplay

    // ── Entry triangle — only when actively long/short ──
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

    // ── Level markers — pinned to right edge of chart ──
    const chartW = containerRef.current?.clientWidth ?? 0
    const chartH = (containerRef.current?.clientHeight ?? 9999) - TIME_AXIS_H
    const step   = tfStepSec(tf)
    const svgLevels: typeof signalLevels = []
    // Pin x to right edge (price axis starts ~65px from right; place arrow just to its left)
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

    // ── No exit triangle or trade lines for live signals ──
    setExitTriangles([])
    setTradeLines([])

    // ── Trade background rect (on click) ──
    const bgs: typeof tradeBgRects = []
    if (activeTradeBgRef.current.has('Signal')) {
      // Show zone from last bar → last bar + 5 steps
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xStart = Number(chart.timeScale().timeToCoordinate(barTimeSec as any))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xEnd   = Number(chart.timeScale().timeToCoordinate((barTimeSec + step * 5) as any))
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
  // data/signal/timeframe read via refs — only re-create when UI state changes
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

  // ── LWC chart — created once when data arrives ────────────────────────────

  useEffect(() => {
    if (!data.length) return
    const container = containerRef.current; if (!container) return

    const normalizedBars = data.map(d => ({
      time:  (toSec(d.time) + TZ_OFFSET_SEC) as UTCTimestamp,
      open:  Number(d.open), high: Number(d.high), low: Number(d.low), close: Number(d.close),
    })).filter(d => d.open > 0 && d.high >= d.low)

    if (!normalizedBars.length) return

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.VerticalGradient, topColor: '#17171b', bottomColor: '#0b0b0e' },
        textColor: 'rgba(200, 200, 200, 0.85)',
        fontFamily: FONT,
        fontSize: 11,
        attributionLogo: false,
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
        lockVisibleTimeRangeOnResize: false, rightOffset: 5,
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

    const futureBars = buildFutureBars(normalizedBars[normalizedBars.length - 1].time as number, timeframe)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData([...normalizedBars, ...futureBars] as any)

    // EMA lines
    const emaFastSeries = chart.addSeries(LineSeries, { color: GOLD, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    const emaSlowSeries = chart.addSeries(LineSeries, { color: '#555', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    emaFastRef.current = emaFastSeries
    emaSlowRef.current = emaSlowSeries

    // Markers plugin
    markersPluginRef.current = createSeriesMarkers(series)
    setPluginReady(n => n + 1)

    // Initial visible range — scroll to current live bar (past the future whitespace)
    const totalBars  = normalizedBars.length + futureBars.length
    const visibleBars = visibleDays === null ? normalizedBars.length : Math.min(normalizedBars.length, Math.round(visibleDays * 86400 / tfStepSec(timeframe)))
    chart.timeScale().setVisibleLogicalRange({ from: totalBars - visibleBars, to: totalBars + 5 })

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
      try { chart.remove() } catch { /* ignore */ }
    }
  // Re-create chart when data length changes (new strategy selected)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length, timeframe])

  // ── Update candle data when bars change ──────────────────────────────────

  useEffect(() => {
    const series = seriesRef.current; const chart = chartRef.current
    if (!series || !chart || !data.length) return
    const normalized = data.map(d => ({
      time:  (toSec(d.time) + TZ_OFFSET_SEC) as UTCTimestamp,
      open:  Number(d.open), high: Number(d.high), low: Number(d.low), close: Number(d.close),
    })).filter(d => d.open > 0 && d.high >= d.low)
    if (!normalized.length) return
    const future = buildFutureBars(normalized[normalized.length - 1].time as number, timeframe)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData([...normalized, ...future] as any)
    // Re-scroll to current bar after data update (setData resets the range)
    const totalBars  = normalized.length + future.length
    const visibleBars = visibleDays === null ? normalized.length : Math.min(normalized.length, Math.round((visibleDays ?? 7) * 86400 / tfStepSec(timeframe)))
    chart.timeScale().setVisibleLogicalRange({ from: totalBars - visibleBars, to: totalBars + 5 })
    requestAnimationFrame(syncOverlay)
    requestAnimationFrame(() => syncSignalTrianglesRef.current())
  }, [data, timeframe, syncOverlay, visibleDays])

  // ── Trade markers ─────────────────────────────────────────────────────────

  useEffect(() => {
    const api = markersPluginRef.current; if (!api) return
    if (!trades.length) { api.setMarkers([]); return }
    api.setMarkers(trades.map(t => ({
      time:     (toSec(t.time) + TZ_OFFSET_SEC) as UTCTimestamp,
      position: t.dir === 'long' ? 'belowBar' : 'aboveBar',
      color:    t.win ? '#F5F5F5' : '#9CA3AF',
      shape:    t.dir === 'long' ? 'arrowUp' : 'arrowDown',
      text:     t.pnlPips != null
        ? `${t.pnlPips > 0 ? '+' : ''}${t.pnlPips.toFixed(0)}p`
        : `${t.win ? '+' : ''}${(t.pnlPct * 100).toFixed(0)}%`,
      size: 1,
    })))
  }, [trades])

  // ── EMA lines ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!emaFastRef.current || !emaSlowRef.current) return
    emaFastRef.current.applyOptions({ visible: showEma && showEmaFast })
    emaSlowRef.current.applyOptions({ visible: showEma && showEmaSlow })
    if (showEma && emaFastData.length) {
      emaFastRef.current.setData(emaFastData.map(d => ({ ...d, time: (toSec(d.time) + TZ_OFFSET_SEC) as UTCTimestamp })))
      if (emaSlowData.length) emaSlowRef.current.setData(emaSlowData.map(d => ({ ...d, time: (toSec(d.time) + TZ_OFFSET_SEC) as UTCTimestamp })))
    }
  }, [emaFastData, emaSlowData, showEma, showEmaFast, showEmaSlow])

  // ─── Render — identical JSX structure to ReferenceCandlestickChart ────────

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', background: '#0e0e12', overflow: 'hidden' }}>

      {/* LWC canvas — same class as Referenzen for pointer-events CSS */}
      <div ref={containerRef} className="monitoring-chart-shell" style={{ position: 'absolute', inset: 0 }} />

      {/* ── Price guide line ── */}
      {priceLine ? (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
          <line data-price-guide="1"
            x1={priceLine.x1} y1={priceLine.y} x2={priceLine.x2} y2={priceLine.y}
            stroke={priceLine.stroke} strokeOpacity={0.92} strokeWidth={1}
            strokeDasharray="3 3" shapeRendering="geometricPrecision" pointerEvents="none" />
        </svg>
      ) : null}

      {/* ── Trade background fills ── */}
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

      {/* ── Signal entry triangles (clickable) ── */}
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

      {/* ── Level arrows (Entry, SL, BE, TP) — small right-pointing triangle only ── */}
      {signalLevels.map((l, i) => {
        const H = 5; const W = 10
        const points = `${l.x - W},${l.y - H} ${l.x - W},${l.y + H} ${l.x},${l.y}`
        return (
          <svg key={i} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6, overflow: 'hidden' }}>
            <polygon points={points} fill={l.color} opacity={0.88} />
          </svg>
        )
      })}

      {/* ── Trade lines entry → exit ── */}
      {tradeLines.map((l, i) => (
        <svg key={i} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }}>
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(160,160,170,0.55)" strokeWidth={1} strokeDasharray="3 4" shapeRendering="geometricPrecision" />
        </svg>
      ))}

      {/* ── Exit triangles (◀ purple) ── */}
      {exitTriangles.map((t, i) => {
        const H = 6; const W = 11
        const points = `${t.x},${t.y} ${t.x + W},${t.y - H} ${t.x + W},${t.y + H}`
        return (
          <svg key={i} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6, overflow: 'hidden' }}>
            <polygon points={points} fill="#A855F7" opacity={0.9} />
          </svg>
        )
      })}

      {/* ── Price/countdown label ── */}
      {priceLabel ? (
        <div className="monitoring-price-axis-label" data-tone={priceLabel.tone}
          style={{
            position: 'absolute', left: priceLabel.left, top: priceLabel.top, width: priceLabel.width,
            transform: 'translateY(-50%)', zIndex: 6, pointerEvents: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
            gap: 1, minHeight: 20, padding: '1px 5px', boxSizing: 'border-box', borderRadius: 3,
            background: priceLabel.backgroundColor,
            border: `1px solid ${priceAxisLabelBorderColor(priceLabel.tone)}`,
            lineHeight: 1, fontFamily: MONITORING_FONT, fontSize: 10,
            boxShadow: `0 0 0 1px ${priceAxisLabelShadowColor(priceLabel.tone)}, 0 2px 8px rgba(0,0,0,0.38)`,
          }}>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_NUNITO, color: PRICE_AXIS_TEXT_COLOR, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
            {priceLabel.priceText}
          </span>
          {priceLabel.countdownText ? (
            <span style={{ fontSize: 10, fontWeight: 400, color: '#9CA3AF', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {priceLabel.countdownText}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── Blur hinter Header ── */}
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

      {/* ── Instrument Header — identical to ReferenceCandlestickChart ── */}
      <div ref={headerRef} style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        pointerEvents: 'auto', userSelect: 'none',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Instrument row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} alt="" style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: FONT, fontSize: 15, fontWeight: 700, color: '#F5F5F5', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
              <span>{symbol}</span>
              <span style={{ color: '#ffffff', fontWeight: 700 }}>·</span>
              <span style={{ fontFamily: FONT_NUNITO, fontWeight: 700 }}>{timeframe.toUpperCase()}</span>
            </div>
            {/* Source row + eye button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.45)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                <span>{name}</span>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
                <span>{exchange}</span>
              </div>
              {/* Eye toggle — only show if there's a live signal */}
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

        {/* Strategy chip */}
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
