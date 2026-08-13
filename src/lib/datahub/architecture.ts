/**
 * CapitalifeDataHub — Process Ownership & Architecture
 *
 * AUTHORITATIVE RUNTIME HIERARCHY
 * ================================
 *
 *   tv_live_feed.py  ──→  Supabase (live_quotes, monitoring_ohlc)  ──→  Flask Engine
 *         ↓                                                                    ↓
 *   TradingView WS                                               HTTP REST (/diagnostics,
 *   (Chart Series +                                              /chart-data, /feed/status)
 *    Live Quotes)                                                              ↓
 *                                                              Next.js Terminal
 *                                                              (DataHub = consumer cache)
 *                                                                             ↓
 *                                                                         Browser
 *
 * AUTHORITATIVE PROCESSES
 * ========================
 *
 * authoritativeProcess: "Flask Engine (bridge/app.py) + Supabase tables"
 *
 * Each component's role:
 *
 * tv_live_feed.py:
 *   - Source of all OHLC bar data (chart-series protocol)
 *   - Source of live quotes (quote session protocol)
 *   - Writes to Supabase: live_quotes + monitoring_ohlc
 *   - Self-supervising: PID lock + exponential backoff restart loop
 *   - External supervisor: feed_supervisor.py (Flask bridge)
 *
 * Supabase:
 *   - Persistent market data store
 *   - Single source of truth for historical bars
 *   - Survives all process restarts
 *   - Tables: live_quotes, monitoring_ohlc, monitoring_asset_universe
 *
 * Flask Engine (bridge/app.py):
 *   - Authoritative runtime for backtest, bar-building, session logic
 *   - Reads Supabase via Python client
 *   - Computes DST-aware market session state
 *   - Builds canonical bars (bar_builder.py)
 *   - Manages feed process via feed_supervisor.py
 *   - Exposes: /diagnostics, /chart-data, /feed/status, /feed/start, /feed/stop
 *
 * Next.js Terminal DataHub (src/lib/datahub/):
 *   - CONSUMER CACHE ONLY — not authoritative
 *   - Populated from:
 *       1. Supabase live_quotes via /api/live-quotes (quote topics)
 *       2. Flask /chart-data via /api/datahub/sync/bars (open bar topics)
 *       3. Flask /feed/status via /api/datahub/sync/feed (feed health topics)
 *   - Cleared on Next.js restart (process-local memory)
 *   - Re-populated on first API call after restart
 *   - Purpose: single-consumer-read abstraction over multiple upstreams
 *
 * PERSISTENCE METHOD
 * ===================
 *
 * persistenceMethod: "Supabase PostgreSQL"
 *   - All market data persists in Supabase regardless of process restarts
 *   - Flask in-memory backtest cache (TTL 3600s) is a soft cache, not source of truth
 *   - Next.js DataHub is a volatile process-local cache (cleared on restart)
 *
 * TRANSPORT TO NEXT.JS
 * =====================
 *
 * transportToNext: "HTTP REST (JSON)"
 *   - Live quotes:  Supabase client → /api/live-quotes → DataHub publish
 *   - Open bar:     Flask /chart-data → /api/datahub/sync/bars → DataHub publish
 *   - Feed health:  Flask /feed/status → /api/datahub/sync/feed → DataHub publish
 *   - Diagnostics:  Flask /diagnostics → TradingEnginePage direct fetch
 *
 * RESTART BEHAVIOR
 * =================
 *
 * restartBehavior:
 *   flask:
 *     - Re-reads from Supabase on each request
 *     - Bar cache warm in ~0.8s via warmup thread
 *     - No data loss; Supabase is the ground truth
 *
 *   nextjs:
 *     - DataHub consumer cache cleared on restart (volatile)
 *     - Re-populated on first request to /api/live-quotes or /api/datahub/sync/*
 *     - Historical + open bar loaded fresh from Flask on next page visit
 *     - Chart renders correctly after one poll cycle
 *
 *   tv_live_feed:
 *     - Gap in monitoring_ohlc from stop time to restart time
 *     - On reconnect: TV chart-series sends 500-bar backfill (timescale_update)
 *     - Backfill is real historical data — never synthetic
 *     - Gap duration classified by gap-classifier: pipeline_failure or source_missing
 *     - Open bar reconstructed from first tick of reconnected bucket
 *
 *   supabase:
 *     - External managed service; no restart concern
 *     - All data persists; considered always-available
 *
 * BAR ALGORITHM AUTHORITY
 * ========================
 *
 * authoritativeBarAlgorithm: "Python bar_builder.py (Capitalife Engine)"
 *
 * Python bar_builder.py:
 *   - Single authoritative algorithm for historical + final bars
 *   - Used by: backtest engine, signal engine, diagnostics
 *   - Bucket rule: floor(epochSec / tfSec) * tfSec (UTC)
 *
 * TypeScript bar-builder.ts (src/lib/datahub/market/bar-builder.ts):
 *   - CONSUMER-SIDE open-bar builder only
 *   - Consumes live quotes to maintain current-bucket state for display
 *   - Uses IDENTICAL bucket rule: Math.floor(epochSec / tfSec) * tfSec
 *   - NEVER used for backtest computation
 *   - NEVER writes to Supabase
 *   - Seeded from Flask-provided open bar on initialization
 *   - When Flask open bar and TS open bar diverge: Flask wins (seedOpenBar call)
 *
 * PROCESS KILL POLICY
 * ====================
 *
 * FORBIDDEN in all Capitalife workflows:
 *   taskkill /F /IM python.exe    ← kills ALL python processes including user tools
 *   pkill python                  ← same issue on POSIX
 *   killall python                ← same issue
 *
 * REQUIRED for Python processes:
 *   taskkill /F /PID <specific-pid>   ← targeted kill only
 *   kill <specific-pid>               ← POSIX equivalent
 *
 * PID tracking:
 *   tv_live_feed.py  → tools/live-feed/tv_live_feed.pid
 *   Flask Engine     → bridge/flask_engine.pid (written at startup)
 *   Sentinel Proxy   → sentinel_proxy/proxy.pid
 *   Signal Loop      → signal_loop.pid
 *
 * See: start_all.bat :kill_by_pidfile helper for safe implementation.
 */

export const DATAHUB_ARCHITECTURE = {
  authoritativeProcess:   "Flask Engine (bridge/app.py) + Supabase",
  persistenceMethod:      "Supabase PostgreSQL (live_quotes, monitoring_ohlc)",
  transportToNext:        "HTTP REST (Flask /diagnostics, /chart-data, /feed/status)",
  nextjsRole:             "consumer-cache",
  authoritativeBarAlgorithm: "Python bar_builder.py (bridge/backtrader/data/bar_builder.py)",
  feedSupervisor:         "bridge/feed_supervisor.py",

  restartBehavior: {
    flask:     "re-reads Supabase on each request; bar cache warm in 0.8s",
    nextjs:    "volatile cache cleared; re-populated on next API call",
    tvFeed:    "chart-series reconnects; 500-bar real backfill from TV; gap classifiable",
    supabase:  "persistent; no data loss on any process restart",
  },

  processKillPolicy: {
    forbidden: ["taskkill /F /IM python.exe", "pkill python", "killall python"],
    required:  "taskkill /F /PID <specific-pid>",
    pidFiles: {
      tvFeed:      "tools/live-feed/tv_live_feed.pid",
      flask:       "bridge/flask_engine.pid",
      sentinelProxy: "sentinel_proxy/proxy.pid",
      signalLoop:  "signal_loop.pid",
    },
  },
} as const
