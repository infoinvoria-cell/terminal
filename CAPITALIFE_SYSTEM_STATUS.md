# CAPITALIFE SYSTEM STATUS AUDIT
**Generated:** 2026-08-16  
**Branch:** feat/white-swan-portfolio-dashboard  
**Auditor:** Read-only architecture audit — no changes made

---

## 1. CAPITALIFE TERMINAL

### Stack
- **Framework:** Next.js 16.2.4 (App Router), React 19, TypeScript, Tailwind 4
- **Database:** Supabase (Postgres) — primary operational store
- **Local storage:** `.runtime/` directory for file-based logs and state; committed `src/data/capitalife/*.json` for static reference data
- **Testing:** Vitest (unit + integration tests, especially for Sentinel)
- **Build target:** Vercel (frontend + API routes) + Railway (two background services)

---

### 1.1 Frontend

| Area | Status | Notes |
|------|--------|-------|
| **Dashboard / App Shell** | IMPLEMENTED | `AppShell`, sidebar, topbar, KPI cards, mobile nav |
| **Globe (3D Macro)** | IMPLEMENTED | react-globe.gl + Three.js; live overlays (ships, conflicts, earthquakes, news, commodities, seasons, signals); Sentinel chat embedded |
| **Monitoring Dashboard** | IMPLEMENTED | Flexible grid, chart grid, strategy workspace, live signals panel, intraday candles, trade execution panel |
| **Strategy Tester UI** | IMPLEMENTED | Equity + drawdown charts, multi-engine selector |
| **Modeling Studio** | IMPLEMENTED | 20+ model visualizations (Monte Carlo, EF, PCA, VaR/CVaR, DrawdownModel, CorrelationMatrix, TailRisk, etc.) |
| **Seasonality** | IMPLEMENTED | Pattern lab, filter lab, walk-forward viz |
| **Core-Invest** | IMPLEMENTED | Monitoring grid, visual grid |
| **White Swan UI** | IMPLEMENTED | Status bar, futures panel, portfolio dashboard page |
| **Brain Graph** | IMPLEMENTED | Force-graph viz, file browser, search |
| **Investor CRM** | IMPLEMENTED | Full CRUD, mobile view, schema migration |
| **Track Record** | IMPLEMENTED | Multi-account equity curve, KPI overview |
| **Mobile** | IMPLEMENTED | Full mirror of desktop views under `src/components/mobile/` with mobile nav |
| **Auth Gate** | IMPLEMENTED | Simple password gate (env var), plus Supabase auth gates for protected sections |
| **Analytics Dashboard** | IMPLEMENTED | Pre-computed analytics view, FS portfolio live panel |

### 1.2 Backend / API Routes

**137 API routes** across these domains:

| Domain | Route Count | Status |
|--------|-------------|--------|
| Monitoring (strategy engine, signals, tester) | ~50 | IMPLEMENTED |
| Sentinel (AI chat, providers, routing) | ~10 | IMPLEMENTED |
| Brain / Brain Graph | ~8 | IMPLEMENTED |
| Market Data (quotes, OHLC, sync) | ~12 | IMPLEMENTED |
| Globe Overlays (events, ships, commodities) | ~15 | IMPLEMENTED |
| Seasonality | ~7 | IMPLEMENTED |
| Core-Invest | ~5 | IMPLEMENTED |
| Investors / CRM | ~8 | IMPLEMENTED |
| Track Record | ~4 | IMPLEMENTED |
| System / Settings / Health | ~6 | IMPLEMENTED |
| DataHub (pub/sub topic layer) | ~3 | IMPLEMENTED |
| Engine / Modeling | ~5 | IMPLEMENTED |
| Auth | 1 | IMPLEMENTED |

### 1.3 Database / Storage

| Layer | Tech | Status |
|-------|------|--------|
| **Supabase Postgres** | `monitoring_ohlc`, `live_quotes`, `forward_signals`, `investors_crm`, `investor_db` | IMPLEMENTED |
| **File-based runtime state** | `.runtime/track-record/*.json`, `.runtime/market-data/*.json`, `.runtime/trade-execution/*.json` | IMPLEMENTED |
| **Static JSON data** | `src/data/capitalife/**`, `public/data/**` — backtest results, strategy configs, WS outputs | IMPLEMENTED |
| **Playwright CSV cache** | `.playwright-mcp/*.csv` — 60+ OHLC CSVs scraped from TradingView | IMPLEMENTED |
| **No SQLite, no Redis, no localStorage data layer** | — | CONFIRMED |

### 1.4 Market Data

| Provider | Data Type | How Connected | Status |
|----------|-----------|--------------|--------|
| **TradingView WebSocket** | Live quotes (real-time or 15-min delayed) | Railway Python service → Supabase `live_quotes` | IMPLEMENTED |
| **TradingView Playwright** | OHLC CSVs for 60+ futures/equity symbols | Python scraper on-demand | IMPLEMENTED |
| **Barchart** | Daily OHLC (futures universe) | Railway Node worker | IMPLEMENTED |
| **Finnhub** | FX pair daily OHLC | Railway Node worker | IMPLEMENTED |
| **Twelvedata** | EUREX futures OHLC | Railway Node worker (8s delay rate limit) | IMPLEMENTED |
| **FRED** | Macro series (CL_SPOT, GC_SPOT, DGS10, DGS2) | Railway Node worker | IMPLEMENTED |
| **Alpaca** | Equities | Railway Node worker | IMPLEMENTED |
| **Dukascopy** | Real-time FX (3s TTL) | Direct REST in Next.js API | IMPLEMENTED |
| **Yahoo Finance** | Used only in WS dev scripts | Offline scripts only, NOT in production worker | PARTIAL |
| **NASA FIRMS** | Wildfire geo-overlay | Direct REST in Next.js API | IMPLEMENTED |
| **AIS** | Ship positions | Direct REST in Next.js API | IMPLEMENTED |

### 1.5 Research System

| Component | Status | Notes |
|-----------|--------|-------|
| **Sentinel AI chat** | IMPLEMENTED | Multi-provider LLM, tool calling, Brain graph RAG, Capitalife context injection |
| **Strategy Tester** | IMPLEMENTED | Multi-engine: MVA, seasonal, agri, intraday, core-invest, anomaly, indices |
| **Seasonality Research** | IMPLEMENTED | Pattern discovery, deep validation, walk-forward, filter lab |
| **Research Shadow Monitor** | IMPLEMENTED | Live shadow-runs strategies against live data |
| **MVA Engine** | IMPLEMENTED | Walk-forward validation, live signal computation |
| **Universal Group Research** | IMPLEMENTED | Strategy group research pipeline |
| **Brain Graph RAG** | IMPLEMENTED | Full-text search + graph context injection into Sentinel |
| **Graphify** | IMPLEMENTED | Index over Brain vault Markdown/JSON files |

### 1.6 Backtesting

| Component | Status |
|-----------|--------|
| Core backtest engine (`src/lib/fsportfolio/backtest.ts`) | IMPLEMENTED |
| Strategy performance calculator | IMPLEMENTED |
| Strategy Tester framework (multiple engine backends) | IMPLEMENTED |
| Walk-forward validation | IMPLEMENTED |
| Monte Carlo scenario engine | IMPLEMENTED |
| Seasonal pattern backtester | IMPLEMENTED |
| White Swan futures backtest | IMPLEMENTED |
| MVA engine + walk-forward | IMPLEMENTED |

### 1.7 Portfolio / Risk

| Component | Status | Notes |
|-----------|--------|-------|
| White Swan portfolio optimization (v1–v6) | IMPLEMENTED | 9 capital tiers ($10k–$100k), core-preserving optimizer |
| Core-Invest sleeve allocation | IMPLEMENTED | Config-driven, paper + live |
| FS Portfolio live panel | IMPLEMENTED | |
| Modeling Studio (EF, MC, PCA, VaR, CVaR) | IMPLEMENTED | 20+ model surfaces |
| Risk engine (`src/lib/trading/riskEngine.ts`) | IMPLEMENTED | Order sizing calculations |
| Portfolio lab compute | IMPLEMENTED | |
| Broker adapter interface | PARTIAL | Abstract interface exists; IBKR not connected |

### 1.8 White Swan

| Component | Status |
|-----------|--------|
| Strategy definition & evidence JSON | IMPLEMENTED |
| Futures backtest engine | IMPLEMENTED |
| v1–v6 computation scripts (iterative improvement) | IMPLEMENTED |
| Capital tier optimization ($10k–$100k, 9 tiers) | IMPLEMENTED |
| Portfolio dashboard with per-tier outputs | IMPLEMENTED |
| Monitoring assets & live signals | IMPLEMENTED |
| IBKR execution probe (TCP connectivity check) | PARTIAL |
| Live IBKR order execution | NOT IMPLEMENTED |

### 1.9 Sentinel / Monitoring (AI)

| Component | Status | Notes |
|-----------|--------|-------|
| Multi-provider LLM router | IMPLEMENTED | 13 providers: Anthropic, Groq, Cerebras, Mistral, Cohere, Gemini, GitHub Models, Cloudflare, HuggingFace, OpenRouter, Ollama, local, custom |
| Streaming SSE endpoint | IMPLEMENTED | |
| Tool calling framework | IMPLEMENTED | `sentinel-tools.ts` + `sentinel-tool-runner.ts` |
| Brain graph RAG | IMPLEMENTED | `graphify-retrieval.ts` |
| Capitalife context injection | IMPLEMENTED | `capitalife-context.ts` |
| Task routing classifier | IMPLEMENTED | math vs chat vs code vs tool-first |
| Token budget management | IMPLEMENTED | Per-provider quota tracking |
| Conversation compaction | IMPLEMENTED | Long-context trimming |
| Free-tier policy enforcement | IMPLEMENTED | `free-policy.ts` |
| Session + quota stores | IMPLEMENTED | File/memory backed |
| Sentinel tests (Vitest) | IMPLEMENTED | 10+ test files covering routing, budget, policy, compaction |

### 1.10 Broker / IBKR / Execution

| Component | Status | Notes |
|-----------|--------|-------|
| Broker adapter interface | PARTIAL | Abstract `BrokerAdapter.ts`; no concrete IBKR implementation |
| Order preview / validation | IMPLEMENTED | `orderPreview.ts`, `riskEngine.ts` |
| Trade execution intent logger | IMPLEMENTED | UI → API → `.runtime/trade-execution/*.json` (paper log only) |
| IBKR TCP connectivity probe | PARTIAL | `scripts/ibkr/white-swan-execution-probe.py` — checks ports 7497/4002 only |
| **IBKR API session / order submission** | NOT IMPLEMENTED | No `ib_insync`, no `ibapi` connection |
| MT4 file reader | IMPLEMENTED | `src/lib/track-record/mt4-file-reader.ts` |
| MT5 snapshot reader | IMPLEMENTED | |
| Myfxbook API | IMPLEMENTED | |
| Darwinex API | IMPLEMENTED | OAuth tokens |
| Track record sync endpoint | IMPLEMENTED | `/api/track-record/sync` |

### 1.11 Deployment Structure

```
Vercel
  └── Next.js app (frontend + all 137 API routes)

Railway Service 1: tools/live-feed/
  └── tv_live_feed.py (Python)
      TradingView WebSocket → Supabase live_quotes (every ~5s)

Railway Service 2: worker/
  └── index.mjs (Node.js)
      Barchart / Finnhub / Twelvedata / FRED / Alpaca → Supabase monitoring_ohlc

Supabase
  └── Postgres DB (live_quotes, monitoring_ohlc, forward_signals, investors_crm, investor_db)

Local (dev only)
  └── PM2 / PowerShell launcher
  └── Playwright CSV scraper (on-demand)
  └── .runtime/ file-based state
```

---

## 2. CAPITALIFE BRAIN

### 2.1 Brain Architecture (as accessible from Terminal)

The Brain is a **local Obsidian vault** at the path `CAPITALIFE_BRAIN_PATH` (env var). It is accessed read-only by the Terminal through two mechanisms:

**Direct file access:**
- `/api/brain/file` — reads a single file from the vault path
- `/api/brain/ls` — directory listing of vault path
- These operate on the local filesystem; unavailable on Vercel cloud

**Brain Graph (Graphify):**
- `src/lib/brain-graph/system-graph.ts` — merges Terminal system nodes (strategies, instruments, datasets, runtime) with Brain vault nodes
- `/api/brain-graph/network` — returns merged graph (Brain nodes + Terminal system nodes) for force-graph visualization
- `/api/brain-graph/search` — full-text search over Brain graph index
- `/api/brain-graph/context-pack` — bundles relevant graph context for Sentinel injection
- `/api/brain-graph/changes` — recent change diff
- `/api/brain-graph/graph-local` — rebuilds graph from local Brain path
- `/api/brain-graph/status` — health and last-refresh time
- `scripts/refresh-brain-graph.mjs` — offline rebuild script
- `scripts/graphify-refresh.ps1` — PowerShell wrapper

**RAG in Sentinel:**
- `src/lib/sentinel/graphify-retrieval.ts` — graph-based retrieval injected into Sentinel prompts

### 2.2 What the Brain Actually Is (vs. What Terminal Sees)

| Brain Capability | Status in Terminal |
|-----------------|-------------------|
| Local Obsidian markdown vault | IMPLEMENTED (Brain side); Terminal reads via API |
| Graphify index (graph.json) | IMPLEMENTED — queryable from Terminal |
| Full-text search over Brain | IMPLEMENTED via `/api/brain-graph/search` |
| Brain RAG in Sentinel | IMPLEMENTED via `graphify-retrieval.ts` |
| File browser in Terminal UI | IMPLEMENTED (`BrainFileBrowser`) |
| Graph visualization | IMPLEMENTED (`BrainGraphShell`, `react-force-graph-2d`) |
| **Vector search / embedding-based RAG** | UNKNOWN — not visible in Terminal code; Graphify is keyword/graph, not vector |
| **Dedicated AI agents in Brain** | UNKNOWN — no agent framework visible from Terminal |
| **Skills / Tool definitions in Brain** | UNKNOWN |
| **Automations running in Brain** | UNKNOWN — could be Obsidian plugins or external scripts |
| **Write-back from Terminal to Brain** | NOT IMPLEMENTED — Terminal is read-only to Brain |

### 2.3 Brain ↔ Terminal Connection Map

```
Brain Vault (local Obsidian)
    │
    ├── Graphify index (graph.json) ──────► /api/brain-graph/* endpoints
    │                                        │
    │                                        ├── BrainGraphShell (force-graph UI)
    │                                        ├── BrainFileBrowser (file tree UI)
    │                                        └── Sentinel RAG (context-pack injection)
    │
    └── Raw filesystem (CAPITALIFE_BRAIN_PATH)
         ├── /api/brain/file (single file read)
         └── /api/brain/ls (directory listing)

Supabase (brain_nodes / brain_links tables referenced in system-graph.ts)
    └── Terminal system nodes merged with Brain nodes at request time
        (NOT written to Supabase; merged in-memory)
```

---

## 3. GESAMTARCHITEKTUR

```
┌─────────────────────────────────────────────────────────┐
│                   CAPITALIFE TERMINAL                    │
│  Next.js (Vercel)                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │   Frontend   │  │  API Routes  │  │  Lib Layer    │ │
│  │  React 19    │  │  137 routes  │  │  (strategy,   │ │
│  │  Globe/Charts│  │              │  │   sentinel,   │ │
│  │  Monitoring  │  │              │  │   backtest,   │ │
│  │  Modeling    │  │              │  │   seasonality,│ │
│  └──────────────┘  └──────────────┘  │   brain-graph)│ │
│                                       └───────────────┘ │
└────────────────┬───────────────────────────────────────┘
                 │
        ┌────────┼──────────────────────┐
        │        │                      │
   Supabase   Railway              Brain (local)
   Postgres   ├─ tv_live_feed.py   Obsidian vault
              └─ worker/index.mjs   │
                                   Graphify
                                   (graph.json)

External Providers:
  Market Data: Barchart, Finnhub, Twelvedata, FRED, Alpaca,
               Dukascopy, TradingView WS, NASA FIRMS, AIS
  AI: Anthropic, Groq, Cerebras, Mistral, Cohere, Gemini,
      GitHub Models, Cloudflare, HuggingFace, OpenRouter, Ollama
  Broker: MT4 files, MT5 snapshots, Myfxbook, Darwinex
          (IBKR: TCP probe only, no live API)
```

---

## 4. STATUS MATRIX

| System | Status | Notes |
|--------|--------|-------|
| Next.js app shell + routing | IMPLEMENTED | |
| Supabase integration | IMPLEMENTED | |
| Live market data (TradingView WS) | IMPLEMENTED | |
| OHLC data worker (Railway) | IMPLEMENTED | |
| Backtest engine | IMPLEMENTED | Multiple engine backends |
| Walk-forward validation | IMPLEMENTED | |
| Monte Carlo / scenario engine | IMPLEMENTED | |
| Seasonality research | IMPLEMENTED | |
| MVA (Macro Valuation) engine | IMPLEMENTED | |
| White Swan strategy | IMPLEMENTED | v1–v6, 9 capital tiers |
| White Swan execution | PARTIAL | TCP probe only; no live IBKR API |
| Sentinel AI chat | IMPLEMENTED | 13 providers |
| Brain Graph / RAG | IMPLEMENTED | |
| Brain vector search | UNKNOWN | Not visible in Terminal |
| Globe overlay layer | IMPLEMENTED | |
| Modeling Studio | IMPLEMENTED | |
| Investor CRM | IMPLEMENTED | |
| Track record (MT4/MT5) | IMPLEMENTED | |
| Track record (IBKR direct) | NOT IMPLEMENTED | |
| IBKR live order execution | NOT IMPLEMENTED | |
| DataHub pub/sub | IMPLEMENTED | Topic-based in-memory layer |
| Playwright OHLC scraper | IMPLEMENTED | On-demand; fragile by nature |
| PM2 / local launcher | IMPLEMENTED | Windows-specific |
| Vercel deployment | IMPLEMENTED | |
| Railway deployment | IMPLEMENTED | Two services |

---

## 5. AKTUELLE TECHNISCHE SCHWÄCHEN (Top 10)

1. **IBKR-Lücke:** Keine live IBKR API-Session. Execution ist nur ein Datei-Logger. White Swan ist vollständig backtested aber nicht live ausführbar ohne manuellen Eingriff.

2. **Playwright-Scraper als OHLC-Quelle:** `.playwright-mcp/` enthält 60+ CSV-Dateien die über TradingView-Scraping erzeugt werden. Fragil, TOS-grenzwertig, nicht production-grade für tägliche Datenversorgung.

3. **Brain Write-Back fehlt:** Terminal kann Brain nur lesen. Kein Feedback-Loop: Research-Ergebnisse, Backtest-Outputs, Signal-Events werden nicht automatisch ins Brain geschrieben.

4. **Kein Vector-RAG:** Graphify ist ein Keyword/Graph-Index über Markdown. Keine Embeddings, kein semantisches Retrieval. Sentinel-RAG ist dadurch auf exakte oder nahe Begriffe beschränkt.

5. **Static JSON als Wahrheitsquelle:** Kritische Daten (WS KPIs, strategy evidence) liegen als committed JSON in `src/data/capitalife/`. Kein automatischer Rebuild-Trigger; manuelle Script-Ausführung erforderlich.

6. **Keine Daten-Provenienz-Versionierung:** OHLC-Daten in Supabase haben keinen Versions-/Source-Track. Wenn ein Provider schlechte Daten liefert, ist nicht nachvollziehbar welche Bars betroffen sind.

7. **Multi-Provider Market Data ohne Konsistenz-Check:** Worker aggregiert von 5+ Providern ohne Cross-Provider-Validierung. Provider-Konflikte (z.B. Barchart vs Finnhub für gleiche Symbole) werden nicht erkannt.

8. **Keine automatisierte Forward-Test-Infrastruktur:** Research Shadow Monitor existiert, aber Forward-Test-Ergebnisse landen nicht strukturiert in einer DB-Tabelle mit historischer Tracking-Logik.

9. **Deployment-Kopplung Brain ↔ Terminal:** Brain-Pfad ist eine lokale Env-Variable. Auf Vercel sind alle Brain/File-Endpoints nicht nutzbar. Cloud-Brain-Zugang fehlt komplett.

10. **Fehlende Test-Coverage für Trading-Kernlogik:** Backtest-Engine, Walk-Forward, Risk-Engine haben keine eigenen Vitest-Tests. Nur Sentinel hat solide Testabdeckung.

---

## 6. WAS BEREITS GUT GELÖST IST

1. **Sentinel Multi-Provider Router:** 13 AI-Provider mit Free-Tier-Policy, Token-Budget-Management, Task-Klassifikation und automatischem Failover. Kein externer Agent-Framework nötig.

2. **Strategy Tester Framework:** Generischer Multi-Engine-Backtester mit austauschbaren Backends (MVA, seasonal, agri, intraday, core-invest, anomaly). Sauber API-getriggert.

3. **White Swan Optimizer (v6):** Core-preserving optimizer über 9 Kapitaltiers mit realistischer IBKR-Kostenmodellierung. Vollständig in-house entwickelt.

4. **Monitoring-System:** Live-Signal-Aggregation, Intraday-Candle-Grid, Strategy-Registry, Research-Draft-Pipeline — vollständig integriert in ein Dashboard.

5. **Globe Layer:** 3D Makro-Overlay mit 15+ Live-Datenschichten (AIS Ships, Konflikte, Feuer, Commodities, News, Seasonality, Signals). Kein externes Geo-Dashboard nötig.

6. **Brain Graph Integration:** System-Nodes (Strategies, Instruments, Datasets) werden mit Brain-Vault-Nodes zu einem einheitlichen Knowledge-Graph gemergt. Clever designed.

7. **Modeling Studio:** 20+ quantitative Modellvisualisierungen (EF, MC, PCA, VaR/CVaR, 3D-Surfaces) vollständig in-house in React/Recharts.

8. **Deployment-Setup:** Klare Drei-Schicht-Architektur (Vercel + 2x Railway + Supabase) mit einfacher Skalierbarkeit.

9. **Security Audit Pipeline:** `audit:github-safe`, `audit:encoding`, `safe:predeploy` — automatisierter Privacy-Check vor jedem Commit/Push.

10. **Supabase als Real-Time Layer:** `live_quotes` mit Supabase Realtime-Subscriptions ermöglicht SSE-Streams ohne eigene WebSocket-Infrastruktur.

---

## 7. EXTERNAL INTEGRATION READINESS

| Domain | Eigene Lösung | Open-Source-Kandidaten | Empfehlung |
|--------|---------------|------------------------|------------|
| **Trading Engine** | Kein live Engine (nur Backtest + Intent-Logger) | QuantConnect Lean, Zipline, Blankly | Lean wäre sinnvoll für Paper-Trading-Schicht |
| **Backtesting** | Vollständig in-house (TS + Python MVA) | Backtrader, vectorbt, bt | vectorbt für Performance bei großen Universes |
| **Portfolio Optimization** | In-house (v6 optimizer, Monte Carlo, EF) | PyPortfolioOpt, Riskfolio-Lib | PyPortfolioOpt für komplexere Constraints |
| **Risk** | In-house (riskEngine.ts, VaR/CVaR surfaces) | QuantLib, empyrical | empyrical für Standard-Metriken |
| **Market Data** | Barchart + Finnhub + Twelvedata + TV WS | OpenBB, yfinance, Quandl | OpenBB Platform als unified data layer |
| **AI Research** | Sentinel (13 providers, tool calling, RAG) | LangChain, AutoGPT, CrewAI | Kein Bedarf — Sentinel ist bereits besser |
| **Agent Framework** | Sentinel Router + Tool Runner | LangGraph, AutoGen | Kein Bedarf — eigene Lösung ausreichend |
| **Knowledge / Memory** | Obsidian + Graphify (keyword graph) | ChromaDB, Weaviate, Qdrant | ChromaDB für Vector-RAG als Ergänzung |
| **Monitoring** | In-house (Monitoring Dashboard, Strategy Registry) | Grafana, Prometheus | Kein Bedarf für Strategy-Monitoring; evtl. Grafana für Infra-Metrics |
| **Execution** | TCP probe only | ib_insync, Interactive Brokers API | `ib_insync` (Python) für IBKR-Live-Execution |

---

## ZUSAMMENFASSUNG

```
CAPITALIFE TERMINAL STATUS:     PRODUCTION-READY (Frontend + Data + Research)
                                 PARTIAL (Execution Layer — IBKR fehlt)

CAPITALIFE BRAIN STATUS:        IMPLEMENTED (Obsidian Vault + Graphify)
                                 PARTIAL (nur Read-Access vom Terminal)
                                 UNKNOWN (interne Brain-Agents/Skills nicht sichtbar)

WHITE SWAN STATUS:              FULLY RESEARCHED & BACKTESTED (v6, 9 Tiers)
                                 NOT LIVE (IBKR API fehlt)

TRADING/EXECUTION STATUS:       PAPER ONLY
                                 TCP probe → kein live Order-Routing

RESEARCH STATUS:                STRONG
                                 Sentinel + Strategy Tester + Seasonality +
                                 MVA + Shadow Monitor + Brain RAG

DATA STATUS:                    STRONG (Live: TV WebSocket → Supabase)
                                 FRAGILE (OHLC: Playwright CSV-Scraper)
                                 MULTI-PROVIDER (5+ Quellen ohne Cross-Validierung)

AI/AGENT STATUS:                STRONG
                                 13 Provider, Tool Calling, RAG, Free-Policy,
                                 Budget-Management, Task-Routing — alles in-house

KNOWLEDGE/MEMORY STATUS:        PARTIAL
                                 Graphify = Keyword-Graph (kein Vector-RAG)
                                 Brain-Write-Back fehlt

MONITORING STATUS:              IMPLEMENTED
                                 Live Signals, Strategy Registry, Shadow Monitor,
                                 Intraday Grid, Research Draft Pipeline

BIGGEST ARCHITECTURE GAPS:
  1. IBKR live execution (ib_insync fehlt)
  2. Vector-RAG (Graphify ist keyword-only)
  3. Brain Write-Back (Terminal → Brain)
  4. Playwright OHLC (fragil, ersetzbar durch API-Aggregator)
  5. Forward-Test DB-Persistenz (kein structured tracking)

BEST EXISTING COMPONENTS:
  1. Sentinel Multi-Provider Router (13 AI providers, alles in-house)
  2. White Swan v6 Optimizer (core-preserving, 9 capital tiers)
  3. Strategy Tester Framework (multi-engine, API-triggered)
  4. Globe Overlay Layer (15+ live data layers)
  5. Modeling Studio (20+ quant model visualizations)
  6. Brain Graph Integration (system + vault nodes unified)
  7. Security Audit Pipeline (pre-commit, pre-push gates)

EXTERNAL INTEGRATION OPPORTUNITIES:
  HIGH VALUE:
    - ib_insync → IBKR live execution for White Swan
    - ChromaDB → Vector-RAG for Sentinel (Brain embeddings)
    - OpenBB Platform → Unified market data (replace Playwright scraper)
  MEDIUM VALUE:
    - vectorbt → High-performance backtesting for large universes
    - PyPortfolioOpt → Advanced portfolio constraints
    - empyrical → Standard risk metrics library
  LOW/NO VALUE (already solved in-house):
    - LangChain / CrewAI / AutoGen → Sentinel is better
    - Grafana → Monitoring is already domain-specific
    - Backtrader / Zipline → Strategy Tester already covers this
```
