-- ── Quarantine corrupt YM1! daily bars ──────────────────────────────────────
--
-- Root cause: seed_anomaly_daily.py fetched YM=F from Yahoo Finance with
-- auto_adjust=True. yfinance back-adjusts continuous futures using ratio-
-- splicing at each contract roll, which collapses older (and sometimes
-- current) bars to a fraction of the true price. For YM1! (Dow Jones E-mini,
-- currently 40 000–53 000 points) this produced bars with close < 5 000 —
-- impossible for any real date in the contract's history (first trade 1997).
--
-- Idempotent: safe to re-run; quarantine INSERT ignores duplicate keys and
-- the DELETE can only remove rows that still exist.
--
-- DO NOT run this without first verifying the quarantine row-count matches
-- your expectation from check_ym1.mjs output.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Quarantine archive table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monitoring_ohlc_quarantine (
  id              bigint generated always as identity primary key,
  original_id     bigint,                      -- id from monitoring_ohlc when captured
  asset           text        NOT NULL,
  timeframe       text        NOT NULL,
  date            text        NOT NULL,
  open            numeric(18, 6),
  high            numeric(18, 6),
  low             numeric(18, 6),
  close           numeric(18, 6),
  volume          numeric(18, 2),
  uploaded_at     timestamptz,
  quarantine_reason text      NOT NULL,
  quarantined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset, timeframe, date, quarantine_reason)
);

ALTER TABLE public.monitoring_ohlc_quarantine ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role access on monitoring_ohlc_quarantine"
  ON public.monitoring_ohlc_quarantine
  USING (true) WITH CHECK (true);
GRANT ALL ON public.monitoring_ohlc_quarantine TO service_role;

-- ── 2. Copy corrupt rows to quarantine ───────────────────────────────────────
-- YM1! 1D bars with close < 5 000 are corrupt.
-- The earliest correct YM price was ~7 000 (1997); current range is 40 000–53 000.
INSERT INTO public.monitoring_ohlc_quarantine
  (original_id, asset, timeframe, date, open, high, low, close, volume,
   uploaded_at, quarantine_reason)
SELECT
  id, asset, timeframe, date, open, high, low, close, volume,
  uploaded_at,
  'ym1_scale_error: close < 5000 on YM1! daily. Expected 6000-55000. '
  || 'Likely Yahoo Finance auto_adjust ratio-splice artifact from seed_anomaly_daily.py. '
  || 'Import source: yfinance YM=F with auto_adjust=True.'
FROM public.monitoring_ohlc
WHERE asset     = 'YM1!'
  AND timeframe = 'D'
  AND close     < 5000
ON CONFLICT (asset, timeframe, date, quarantine_reason) DO NOTHING;

-- ── 3. Remove corrupt rows from live table ────────────────────────────────────
DELETE FROM public.monitoring_ohlc
WHERE asset     = 'YM1!'
  AND timeframe = 'D'
  AND close     < 5000;

-- ── 4. Protect against re-import ─────────────────────────────────────────────
-- A CHECK constraint on monitoring_ohlc would require ALTER TABLE which blocks
-- concurrent reads on large tables. We use a lightweight trigger function
-- instead: any upsert of a YM1! daily row with close < 5 000 is rejected.
-- The seeder's own validation (added to seed_anomaly_daily.py) is the primary
-- guard; this trigger is the database-level backstop.

CREATE OR REPLACE FUNCTION public.monitoring_ohlc_ym1_scale_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.asset = 'YM1!'
     AND NEW.timeframe = 'D'
     AND NEW.close IS NOT NULL
     AND NEW.close < 5000 THEN
    RAISE EXCEPTION
      'monitoring_ohlc scale guard: YM1! daily close % is below 5000. '
      'This indicates a corrupt import (Yahoo auto_adjust artifact or wrong ticker). '
      'Correct YM1! price range is 6000–55000.',
      NEW.close;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS monitoring_ohlc_ym1_scale_guard_trigger
  ON public.monitoring_ohlc;

CREATE TRIGGER monitoring_ohlc_ym1_scale_guard_trigger
  BEFORE INSERT OR UPDATE ON public.monitoring_ohlc
  FOR EACH ROW EXECUTE FUNCTION public.monitoring_ohlc_ym1_scale_guard();

COMMIT;
