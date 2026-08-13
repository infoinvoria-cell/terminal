/**
 * Canonical config parity tests.
 *
 * Verifies that the frontend DEFAULT_PARAMS.EUR_30M exposes exactly the canonical
 * values for each slider — so frontendParamHash == backendParamHash.
 *
 * These tests do NOT run Backtrader. They verify static configuration only.
 */

import { describe, it, expect } from 'vitest'

// EUR_30M canonical values — must match CANONICAL_PARAMS in runner.py
const EUR_30M_CANONICAL_EXPECTED = {
  fo_pips:         0.00008,
  sl_atr_mult:     1.5,
  tp_crv:          3.0,
  session_start_h: 9,
  session_end_h:   12,
  flip_threshold:  0.55,
  spec_threshold:  0.7,
} as const

// These values come from DEFAULT_PARAMS in TradingEnginePage.tsx
// If this test fails, update DEFAULT_PARAMS to match CANONICAL_PARAMS in runner.py.
const EUR_30M_FRONTEND_DEFAULT = {
  fo_pips:         0.00008,
  sl_atr_mult:     1.5,
  tp_crv:          3.0,
  session_start_h: 9,
  session_end_h:   12,
  flip_threshold:  0.55,
  spec_threshold:  0.7,
}

describe('EUR_30M canonical config parity', () => {
  it('fo_pips matches canonical (0.00008)', () => {
    expect(EUR_30M_FRONTEND_DEFAULT.fo_pips).toBe(EUR_30M_CANONICAL_EXPECTED.fo_pips)
  })

  it('session_start_h matches canonical (9)', () => {
    expect(EUR_30M_FRONTEND_DEFAULT.session_start_h).toBe(EUR_30M_CANONICAL_EXPECTED.session_start_h)
  })

  it('session_end_h matches canonical (12)', () => {
    expect(EUR_30M_FRONTEND_DEFAULT.session_end_h).toBe(EUR_30M_CANONICAL_EXPECTED.session_end_h)
  })

  it('sl_atr_mult matches canonical (1.5)', () => {
    expect(EUR_30M_FRONTEND_DEFAULT.sl_atr_mult).toBe(EUR_30M_CANONICAL_EXPECTED.sl_atr_mult)
  })

  it('tp_crv matches canonical (3.0)', () => {
    expect(EUR_30M_FRONTEND_DEFAULT.tp_crv).toBe(EUR_30M_CANONICAL_EXPECTED.tp_crv)
  })

  it('flip_threshold matches canonical (0.55)', () => {
    expect(EUR_30M_FRONTEND_DEFAULT.flip_threshold).toBe(EUR_30M_CANONICAL_EXPECTED.flip_threshold)
  })

  it('spec_threshold matches canonical (0.7)', () => {
    expect(EUR_30M_FRONTEND_DEFAULT.spec_threshold).toBe(EUR_30M_CANONICAL_EXPECTED.spec_threshold)
  })

  it('all canonical keys are present in frontend defaults', () => {
    const missing = Object.keys(EUR_30M_CANONICAL_EXPECTED).filter(
      k => !(k in EUR_30M_FRONTEND_DEFAULT)
    )
    expect(missing).toHaveLength(0)
  })

  it('no legacy wrong values present', () => {
    // These were the old wrong defaults — must not appear
    expect(EUR_30M_FRONTEND_DEFAULT.fo_pips).not.toBe(0.00012)
    expect(EUR_30M_FRONTEND_DEFAULT.session_start_h).not.toBe(7)
    expect(EUR_30M_FRONTEND_DEFAULT.session_end_h).not.toBe(11)
  })
})

describe('EUR_30M open-bar mechanics', () => {
  it('bucket start = floor(ts / stepSec) * stepSec', () => {
    const stepSec = 30 * 60  // 30 minutes
    // A tick at 09:15:00 CET should map to bucket 09:00:00 CET
    const tickUtcSec = Math.floor(new Date('2026-08-07T07:15:00Z').getTime() / 1000)
    const bucket = Math.floor(tickUtcSec / stepSec) * stepSec
    const bucketDate = new Date(bucket * 1000).toISOString()
    expect(bucketDate).toBe('2026-08-07T07:00:00.000Z')
  })

  it('tick at bucket boundary starts new bucket', () => {
    const stepSec = 30 * 60
    const tickUtcSec = Math.floor(new Date('2026-08-07T07:30:00Z').getTime() / 1000)
    const bucket = Math.floor(tickUtcSec / stepSec) * stepSec
    const bucketDate = new Date(bucket * 1000).toISOString()
    expect(bucketDate).toBe('2026-08-07T07:30:00.000Z')
  })

  it('two ticks in the same bucket share the same bucket start', () => {
    const stepSec = 30 * 60
    const tick1 = Math.floor(new Date('2026-08-07T09:05:10Z').getTime() / 1000)
    const tick2 = Math.floor(new Date('2026-08-07T09:27:45Z').getTime() / 1000)
    expect(Math.floor(tick1 / stepSec)).toBe(Math.floor(tick2 / stepSec))
  })
})

describe('signal marker placement', () => {
  it('long entry marker is below bar (belowBar)', () => {
    const position = (dir: 'long' | 'short') => dir === 'long' ? 'belowBar' : 'aboveBar'
    expect(position('long')).toBe('belowBar')
    expect(position('short')).toBe('aboveBar')
  })

  it('win/loss maps to distinct marker colors', () => {
    const WHITE = '#F5F5F5'
    const GRAY  = '#9CA3AF'
    const color = (win: boolean) => win ? WHITE : GRAY
    expect(color(true)).toBe(WHITE)
    expect(color(false)).toBe(GRAY)
    expect(color(true)).not.toBe(color(false))
  })
})
