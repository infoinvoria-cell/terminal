'use client'
import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers, type UTCTimestamp } from 'lightweight-charts'

interface OhlcBar { time: number; open: number; high: number; low: number; close: number }
interface Trade { time: number; win: boolean; dir: string; pnlPct: number }

const ts = (t: number) => t as UTCTimestamp

interface Props {
  data: OhlcBar[]
  trades?: Trade[]
  emaFastData?: { time: number; value: number }[]
  emaSlowData?: { time: number; value: number }[]
  showEma?: boolean
}

export default function LWChart({ data, trades = [], emaFastData = [], emaSlowData = [], showEma = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return

    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { color: '#0A0A0A' }, textColor: '#a1a1aa' },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: 1 },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true, secondsVisible: false, rightOffset: 5 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
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

    if (data?.length) {
      series.setData(data.map(b => ({ ...b, time: ts(b.time) })))
      chart.timeScale().fitContent()
    }

    emaFastSeries.applyOptions({ visible: showEma })
    emaSlowSeries.applyOptions({ visible: showEma })
    if (showEma && emaFastData.length) {
      emaFastSeries.setData(emaFastData.map(d => ({ ...d, time: ts(d.time) })))
      emaSlowSeries.setData(emaSlowData.map(d => ({ ...d, time: ts(d.time) })))
    }

    if (trades.length) {
      markerApi.setMarkers(
        trades.map(t => ({
          time: ts(t.time),
          position: t.dir === 'long' ? 'belowBar' : 'aboveBar',
          color: t.win ? '#22C55E' : '#EF4444',
          shape: t.dir === 'long' ? 'arrowUp' : 'arrowDown',
          text: `${t.win ? '+' : ''}${(t.pnlPct * 100).toFixed(0)}p`,
          size: 1,
        }))
      )
    }

    return () => chart.remove()
  }, [data, trades, emaFastData, emaSlowData, showEma])

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />
}
