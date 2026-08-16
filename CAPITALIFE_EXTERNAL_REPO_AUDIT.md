# CAPITALIFE EXTERNAL REPOSITORY AUDIT
**Generated:** 2026-08-16  
**Branch:** feat/white-swan-portfolio-dashboard  
**Scope:** Read-only architecture audit — no changes made, no code written  
**Repos evaluated:** NautilusTrader · skfolio · Kronos · Vibe-Trading

---

## PART 1 — CAPITALIFE CURRENT STATE (verified from code)

Before evaluating external repos, the following was confirmed from actual code — not documentation:

### White Swan Optimizer (ws-v6-core-preserving.mjs)
The optimizer is a **greedy integer-constrained capital-tier allocator**, NOT a convex optimizer. It iterates over 9 discrete capital tiers (€10k–€100k), enforces 5 core sleeves as hard constraints (total core margin ~€3,011), then allocates additional integer contracts via four parallel greedy variants (MAX_RETURN / BALANCED / MAX_SHARPE / MAX_CALMAR). Scoring weights OOS CAGR 2019+ at 5.0/8.5 — it dominates the selection. Margins are capped at 95% of capital; stress buffer of 12% of capital is reserved.

**IBKR cost modeling gap confirmed:** v6 uses Serkan reference rates (€1.70 roundtrip) for most instruments. The confirmed IBKR all-in cost JSON shows FDXS is actually €0.76 roundtrip (v6 overstates by 2.2×) and agricultural contracts (ZW/ZC/ZS) are €4.92 (v6 uses reference only). This means v6 backtest net returns are slightly understated for DAX and overstated for agri.

### Backtest Reality Check
- Only **2 of 17 WS components** have true futures trade-level replication (`FP10_YM1_TAT` and DAX 2H FDXS)
- **12 seasonal components**: no trade-level files in repo — cannot compute true futures P&L from existing data
- **FS Portfolio backtest** (`fsportfolio/backtest.ts`): uses daily close-to-close returns, NOT a futures-native backtest
- White Swan composite P&L in v6 is built from `all-trades.json` workspace file (not in repo) — reproducibility gap

### Execution Gap
- IBKR integration: TCP port probe only (`scripts/ibkr/white-swan-execution-probe.py`)
- No `ib_insync`, no `ibapi`, no live order submission
- Trade execution intent: written to `.runtime/trade-execution/*.json` (paper log, file-based)
- This is Capitalife's **#1 production gap**

### Sentinel (confirmed strengths)
- 13 AI providers with free-tier policy, budget management, task routing, tool calling
- Brain graph RAG via Graphify (keyword-based, not vector)
- 10+ Vitest test files covering routing, budget, compaction
- Better structured than any external agent framework evaluated

---

## PART 2 — NAUTILUSTRADER

### What It Is
Rust-native event-driven trading engine, Rust core via PyO3 bindings, Python strategy API. Deterministic single-threaded kernel + multi-threaded Tokio async I/O. Research-to-live parity is an explicit design guarantee: same kernel, cache, portfolio, execution engine in both backtest and live modes.

| Property | Status |
|---|---|
| Tick-level backtesting | YES — QuoteTick, TradeTick, OrderBookDelta, Bar |
| Deterministic backtest | YES — explicitly guaranteed |
| Research-to-live parity | YES — same kernel in both modes |
| Futures support (FUT/FOP) | YES — confirmed in IbSecurityType enum |
| CME / EUREX | YES — via IB adapter (any IB-accessible exchange) |
| Daily MTM snapshots | YES — UTC midnight + shutdown automatic recording |
| IBKR adapter | YES — Rust-native, built-in, ibapi crate wrapper |
| IBKR paper / live | YES — ports 4002/7497 paper, 4001/7496 live |
| Databento adapter | YES — data only (MBO L3, MBP L1/L2, OHLCV, DEFINITION) |
| 9 order types | YES — including trailing stops, MTL, MIT, LIT |
| Pre-trade risk engine | YES — runs on single-threaded kernel pre-submission |
| Multi-currency PnL | YES — automatic conversion |
| Docker support | YES — GitHub Container Registry images |
| Linux 24/7 | YES — x86_64 and ARM64 |
| GPU requirement | NO |
| License | LGPL-3.0 (proprietary strategies OK, lib modifications must share) |
| Python version | 3.12–3.14 |
| Community | 25,556 stars, last commit today (2026-08-16), active |
| v2 API stability | NOT YET — breaking changes still possible pre-v2.0 |

### Answers to Required Questions

**A) Should NautilusTrader become our trading/execution layer?**  
YES — specifically as a **Python sidecar service** for IBKR live execution. It solves Capitalife's #1 production gap. The natural architecture: NautilusTrader runs as an isolated Python process with a REST/WebSocket bridge; Capitalife Terminal consumes execution state and pushes orders via API. White Swan strategies are re-expressed as Nautilus strategies in Python, running in parallel with the existing TS dashboard for monitoring.

**B) Could White Swan be reproduced in Nautilus for independent MTM/NAV validation?**  
YES, but with known constraints: only 2 of 17 WS components have trade-level data for true futures replication. The 12 seasonal components would need to be re-expressed as Nautilus strategies with synthetic entry/exit rules derived from the existing seasonal patterns. This is a multi-week implementation task. The output — daily NAV, accurate MTM, per-contract cost tracking — would be more rigorous than the current `all-trades.json` composite approach.

**C) What existing Capitalife components would Nautilus replace?**
- IBKR execution (currently nothing → Nautilus fills completely)
- Order management (currently nothing → Nautilus fills completely)
- Risk engine for live orders (`riskEngine.ts` → Nautilus pre-trade risk engine)
- Potentially the futures backtest engine (TypeScript → Python Nautilus, but only where trade data exists)

**D) What Capitalife components should unambiguously stay?**
- Sentinel (multi-provider AI, brain RAG) — Nautilus has no equivalent
- White Swan Dashboard UI (React/Next.js)
- Globe overlay layer
- Strategy Tester + seasonality research pipeline
- Brain Graph + Graphify
- Modeling Studio (Monte Carlo, EF, PCA, VaR/CVaR)
- Investor CRM
- Market data infrastructure (Supabase live_quotes, Railway workers)

**E) Integration effort / technical risk**
- **Effort: High** — 4–8 weeks minimum to implement a working NautilusTrader IB adapter sidecar, expose REST bridge, re-express WS strategies in Python, and wire Capitalife Terminal to consume live execution state
- **Risk: Medium** — v2 API still in RC; IB Gateway must be configured for UTC timestamps; continuous futures live quotes not supported (use active-month rolling); single `TradingNode` per process (no multi-instance)
- **Mitigation**: Start with paper trading only, validate MTM/NAV matches v6 computation before going live

---

## PART 3 — SKFOLIO

### What It Is
scikit-learn compatible Python library for portfolio optimization. CVXPY/Clarabel solver backend. Full sklearn Pipeline, GridSearchCV, cross_val_predict compatibility. Last commit: August 13, 2026 (active). BSD-3 license.

| Property | Status |
|---|---|
| MVO / Max Sharpe / Min Variance | YES |
| CVaR / CDaR optimization | YES |
| Maximum Diversification | YES |
| Risk Parity / HRP / HERC / NCO | YES |
| LW shrinkage covariance | YES |
| Gerber / Denoise / EW covariance | YES |
| Regime-adjusted EW covariance | YES (continuous adaptive, not discrete HMM) |
| Walk-forward CV | YES — built-in `WalkForward` splitter |
| Combinatorial Purged CV (CPCV) | YES — built-in, Lopez de Prado implementation |
| Turnover / transaction cost constraints | YES (linear costs only) |
| Group / sector constraints | YES |
| Integer lot constraints (0,1,2,3 contracts) | **NO** — cardinality (count of held assets) YES, integer lot-size NO |
| Fixed-cost per-trade modeling | **NO** — linear proportional costs only |
| Futures margin modeling | **NO** — no built-in margin requirement parameters |
| GPU requirement | NO — pure Python/numpy/cvxpy |
| License | BSD 3-Clause |

### Answers to Required Questions

**A) Should skfolio replace our integer contract optimizer?**  
**NO.** This is the critical finding: skfolio produces continuous portfolio weights (0.0–1.0 fractions), not integer lot quantities. The White Swan optimizer must produce 0, 1, 2, 3... integer contracts per strategy, enforcing margin constraints, core sleeve minimums, and IBKR granularity. skfolio cannot model this directly. Replacing the WS optimizer with skfolio would require a post-processing integer rounding step that would violate the careful margin and granularity constraints already in `execution-scaling.ts`.

**B) Better as a challenger / target-weight / risk-allocation engine upstream of our integer optimizer?**  
**YES — this is the correct role.** The right architecture:

```
skfolio (continuous weights, risk allocation, CPCV robustness)
    ↓
WS greedy integer contract allocator (core enforcement, margin, granularity)
    ↓
execution-scaling.ts (APPROXIMATELY_EXECUTABLE / EXACTLY_EXECUTABLE check)
```

Specifically, skfolio could:
1. Compute risk-parity or HRP target weights for WS components using robust covariance (Gerber or LW shrinkage)
2. These target weights inform the `extraFn` greedy allocation instead of the current hardcoded MAX_RETURN / BALANCED variants
3. Run CPCV on WS historical returns to get an honest out-of-sample robustness estimate without data snooping

**Could skfolio improve our overfitting/robustness checks?**  
**YES, significantly.** The current WS robustness validation uses a single 2019+ OOS split. CPCV generates K×(K-1) out-of-sample paths from the full history, providing a distribution of Sharpe ratios rather than a point estimate. This directly addresses the overfitting risk in the 17-component selection. This can be implemented as a standalone Python research script — no integration with the TypeScript codebase required initially.

**Implementation path (no framework integration needed):**
```python
# Standalone research script
from skfolio import Population
from skfolio.optimization import HierarchicalRiskParity
from skfolio.model_selection import CombinatorialPurgedCV, cross_val_predict

cv = CombinatorialPurgedCV(n_splits=10, n_test_splits=2)
model = HierarchicalRiskParity(covariance_estimator=LedoitWolf())
pred = cross_val_predict(model, ws_returns_df, cv=cv)
# → distribution of OOS Sharpe ratios for robustness assessment
```

---

## PART 4 — KRONOS

### What It Is
Decoder-only autoregressive Transformer pre-trained on 12 billion financial K-line (OHLCV) records from 45 global exchanges. Purpose-built for financial candlestick sequences. AAAI 2026 paper (arXiv 2508.02739). Distinct from Amazon Chronos (general time-series, not financial-specific).

| Property | Status |
|---|---|
| Financial OHLCV native | YES — only domain it was trained on |
| Probabilistic forecasting | YES — stochastic sampling |
| Volatility forecasting | YES — 9% lower MAE vs baselines |
| Regime detection | NO — no built-in HMM/regime logic |
| Model sizes | 4.1M (mini), 24.7M (small), 102.3M (base), 499.2M (large, closed) |
| GPU (CUDA) assumed | YES — all code uses `device="cuda:0"` |
| CPU-only inference | UNKNOWN — not documented or confirmed |
| Inference latency | UNKNOWN — not published |
| Fine-tuning | YES — two-stage (tokenizer + predictor) |
| Look-ahead leakage protection | NONE built-in — user responsibility |
| Training cutoff | June 2024 (test set from July 2024) |
| Hugging Face | YES — NeoQuasar/Kronos-base |
| License | MIT |

### Key Concern: Look-Ahead Leakage
Kronos has no built-in safeguard. If used in backtesting, the context window feeding historical OHLCV to the model must be strictly cut at the bar being evaluated. Any pipeline that feeds future data — even accidentally — produces invalid backtest results with no warning from the model.

### Acceptable Ex-Ante Applications for WS
| Use Case | Feasibility | Risk |
|---|---|---|
| Volatility regime feature (scale WS position sizes on high-vol regimes) | POSSIBLE | High (GPU req unknown, latency unknown) |
| Market regime filter (suppress signals in adverse regimes) | POSSIBLE | High (regime detection not built-in, requires custom head) |
| Research signal for WS component universe expansion | LOW PRIORITY | Medium (not core research method) |
| Replace historical WS trade P&L / NAV | **FORBIDDEN** | Critical (violates audit integrity) |
| Replace seasonal pattern signals with Kronos forecasts | NOT RECOMMENDED | High (look-ahead risk, not better than WS evidence) |

### Decision Rationale
Kronos is genuinely novel — the only open-source OHLCV foundation model with volatility forecasting. However, for Capitalife specifically:
- GPU requirement unknown for server deployment
- Inference latency unknown (cannot assess real-time usability)
- No regime detection built-in — the primary WS research use case would need custom architecture
- Look-ahead leakage risk is non-trivial to manage correctly in the WS backtest pipeline
- WS already uses realized annual return volatility for scaling — Kronos vol forecasting would need to beat this baseline first

---

## PART 5 — VIBE-TRADING (HKUDS)

### What It Is
Multi-agent AI workspace for quantitative finance. LangGraph + LangChain orchestration, 7 backtest engines (incl. GlobalFutures), 68+ MCP tools, 460+ alpha factors, 24 data sources, 13 broker integrations. MIT license. ~31,000 stars (AAAI-backed, HKU Data Science Lab).

| Property | Status |
|---|---|
| Multi-agent orchestration | YES — LangGraph DAGs (29 YAML-defined Swarm presets) |
| Hypothesis Registry | YES — CLI with list/show/invalidate, hash-chained |
| Hash-chained audit ledger | YES — fsync-durable, edit-detection via prev_hash_mismatch |
| Run manifests (methodology fingerprint) | YES — hash over prompt + skills + tool registry + packages |
| MCP surface | YES — 68–70 tools via stdio |
| Alpha factor library | YES — 460+ academic/technical/fundamental factors |
| Multi-provider LLM | YES — 20+ providers (Claude, GPT, DeepSeek, Kimi, Ollama, etc.) |
| Knowledge graph | **NO** — FTS5 + DuckDB, not graph-structured |
| Brain graph | **NO** |
| Globe / Geo overlay | **NO** |
| Monitoring dashboard | **NO** |
| IBKR integration | YES — via broker SDK extras |
| GlobalFutures backtest engine | YES — 1 of 7 engines |
| Purged CV (QuantLib) | YES — QuantLib-backed, 249+ finance math functions |
| Sandboxed code execution | YES — broker layers, sockets, subprocesses blocked |
| Memory | FTS5 keyword search (same tier as Graphify, not better) |
| License | MIT |
| Key risk | LangGraph/LangChain dependency; model quality determines output quality |

### Direct Comparison: Capitalife vs. Vibe-Trading

| Capability | Capitalife | Vibe-Trading | Winner |
|---|---|---|---|
| Multi-provider LLM router | 13 providers, free-policy, budget mgmt | 20+ via LangChain | Tie (different strengths) |
| Tool calling | Custom sentinel-tool-runner | LangChain dispatch | Tie |
| Brain graph | YES — system + vault nodes unified | NO | **Capitalife** |
| Knowledge graph | YES (keyword, Graphify) | FTS5 (keyword) | Tie |
| Globe overlay | YES | NO | **Capitalife** |
| Monitoring dashboard | YES — full strategy + signal dashboard | NO | **Capitalife** |
| Hypothesis Registry | NO | YES — hash-chained, audit ledger | **Vibe-Trading** |
| Run manifests / audit trail | NO | YES — methodology fingerprint per run | **Vibe-Trading** |
| Alpha factor library | NO (uses seasonal/MVA signals) | 460+ factors | **Vibe-Trading** |
| Futures backtest | YES (TypeScript + Python MVA) | YES (GlobalFutures engine) | Tie (different) |
| Agent DAG presets | NO | 29 YAML presets (LangGraph) | Vibe-Trading (but LangGraph overhead) |
| Sentinel tests | YES — 10+ Vitest files | No test framework mentioned | **Capitalife** |
| Deployment model | Vercel + Railway + Supabase (production) | Self-hosted Python (research tool) | **Capitalife** |

### What Capitalife Could Borrow (WITHOUT integrating the framework)

**1. Hypothesis Registry concept**  
A simple markdown table in Brain + Sentinel tool that records: hypothesis, date, test method, result, invalidated? No LangGraph needed — a Brain note template + one Sentinel tool to query/update it.

**2. Run manifest / methodology fingerprint**  
Each WS script run or Strategy Tester execution writes a JSON manifest: `{timestamp, script_version, input_data_hash, parameters, output_kpis}`. Not cryptographically hash-chained, but sufficient for reproducibility audit. ~50 lines of code added to any compute script.

**3. Invalidation discipline**  
When a WS component's backtest is superseded by new data or a corrected methodology, the old result should be explicitly marked invalid rather than quietly overwritten. This is a process discipline, not a framework requirement.

### What NOT to borrow
- LangGraph / LangChain: Sentinel already does multi-provider routing, tool calling, and task classification. Adding LangGraph creates a second agent stack with conflicting state management.
- The GlobalFutures backtest engine: NautilusTrader's is better (deterministic, Rust-core, research-to-live parity).
- The 460 alpha factors: WS uses systematic futures strategies (seasonal, MVA, trend), not equity alpha factors. The factor library is irrelevant to WS.

---

## PART 6 — CLOUD / SERVER FIT

| Repo | Linux | Docker | RAM/CPU | GPU | Unattended 24/7 | Restart Recovery | Complexity | Security Surface | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| NautilusTrader | YES (x86_64 + ARM64) | YES (GHCR) | Unknown min; low CPU expected | NO | YES (Tokio async) | UNKNOWN (no failover docs found) | Medium | Low (no external SaaS deps) | GOOD |
| skfolio | YES | YES (trivial) | < 1 GB RAM typical | NO | N/A (batch compute) | N/A | Low | Minimal | EXCELLENT |
| Kronos | YES | YES | Unknown VRAM req | YES (CUDA required) | UNKNOWN | N/A | High (GPU infra) | Low | CONDITIONAL |
| Vibe-Trading | YES | YES (digest-pinned) | Moderate (DuckDB + LLM calls) | NO | PARTIAL (scheduler toggle) | PARTIAL (FTS5 session resume) | High (LangGraph + 24 data sources) | Medium (broker SDK extras) | RESEARCH_ONLY |

**Planned Capitalife server architecture fit:**
- NautilusTrader: natural fit as a deterministic execution sidecar (Python process, Docker-deployable, Linux-native, no GPU)
- skfolio: natural fit as an occasional batch compute step (Python script, 0 infra requirements)
- Kronos: requires dedicated GPU instance — **NOT fit for current server plan without GPU**
- Vibe-Trading: adds LangGraph + DuckDB + 24-source data infra — significant operational overhead for the value extracted

---

## PART 7 — DUPLICATION AUDIT

### NautilusTrader

| Feature | Status |
|---|---|
| IBKR live order execution | MISSING_IN_CAPITALIFE → NautilusTrader fills |
| Order management (9 types) | MISSING_IN_CAPITALIFE → NautilusTrader fills |
| Research-to-live parity engine | MISSING_IN_CAPITALIFE → NautilusTrader fills |
| Daily MTM / NAV snapshots | MISSING_IN_CAPITALIFE → NautilusTrader fills |
| Pre-trade risk engine (live) | PARTIALLY_IN_CAPITALIFE (riskEngine.ts, no live hookup) → BETTER_IN_EXTERNAL |
| Futures backtest (tick-level) | BETTER_IN_EXTERNAL (Capitalife uses TypeScript close-to-close approximation) |
| Monitoring dashboard | ALREADY_EXISTS_IN_CAPITALIFE (keep) |
| Sentinel AI | ALREADY_EXISTS_IN_CAPITALIFE (keep — Nautilus has nothing here) |
| Brain Graph / RAG | ALREADY_EXISTS_IN_CAPITALIFE (keep) |
| Useful ideas to port | Run state via file-based journal (already similar in .runtime/) |

### skfolio

| Feature | Status |
|---|---|
| Continuous portfolio optimization (MVO, HRP) | MISSING_IN_CAPITALIFE |
| Purged CV / CPCV for robustness | MISSING_IN_CAPITALIFE → high value |
| Regime-adjusted covariance | MISSING_IN_CAPITALIFE |
| Integer contract optimizer | BETTER_IN_CAPITALIFE (skfolio cannot do integer lots) |
| Core sleeve enforcement | BETTER_IN_CAPITALIFE (domain-specific constraint, not in skfolio) |
| IBKR cost modeling | BETTER_IN_CAPITALIFE (already has ibkr-costs.json per instrument) |
| Walk-forward backtesting | ALREADY_EXISTS_IN_CAPITALIFE (partially, single OOS split) |
| Useful ideas to port | CPCV as standalone research script; RegimeAdjustedEW for correlation assumptions |

### Kronos

| Feature | Status |
|---|---|
| OHLCV foundation model | MISSING_IN_CAPITALIFE |
| Volatility forecasting | MISSING_IN_CAPITALIFE (uses realized vol currently) |
| Regime detection (ex-ante) | MISSING_IN_CAPITALIFE |
| Historical backtest data | ALREADY_EXISTS_IN_CAPITALIFE (Kronos CANNOT replace this) |
| Research signal generation | ALREADY_EXISTS_IN_CAPITALIFE (seasonality, MVA — better validated) |

### Vibe-Trading

| Feature | Status |
|---|---|
| Hypothesis Registry | MISSING_IN_CAPITALIFE → high value to port as pattern |
| Hash-chained run manifests | MISSING_IN_CAPITALIFE → medium value to port as pattern |
| Alpha factor library (460+) | MISSING_IN_CAPITALIFE (but not relevant to WS futures approach) |
| LangGraph orchestration | ALREADY_EXISTS_IN_CAPITALIFE (Sentinel = BETTER for our use case) |
| Multi-provider LLM router | ALREADY_EXISTS_IN_CAPITALIFE (Sentinel = BETTER structured) |
| Brain Graph | ALREADY_EXISTS_IN_CAPITALIFE (Vibe-Trading has nothing equivalent) |
| Globe overlay | ALREADY_EXISTS_IN_CAPITALIFE (not in Vibe-Trading) |
| Monitoring dashboard | ALREADY_EXISTS_IN_CAPITALIFE (not in Vibe-Trading) |
| Knowledge graph | NEITHER has true vector/graph RAG |

---

## PART 8 — ARCHITECTURE RECOMMENDATION

The objectively better architecture based on actual code state:

```
┌─────────────────────────────────────────────────────────────┐
│              CAPITALIFE BRAIN (Obsidian + Graphify)         │
│              + Hypothesis Registry (pattern from Vibe)      │
│              + Run Manifests (pattern from Vibe)            │
│              + [FUTURE: ChromaDB vector RAG]                │
└──────────────────────────┬──────────────────────────────────┘
                           │
              Sentinel AI (research, hypothesis generation,
                           signal ideas, tool calling)
                           │
              Strategy Tester / Seasonality / MVA
              (research validation, existing Capitalife)
                           │
         ┌─────────────────▼────────────────────┐
         │   skfolio (Python research script)   │
         │   CPCV robustness validation         │
         │   HRP / LW covariance challenger     │
         │   target-weight generation           │
         └─────────────────┬────────────────────┘
                           │ continuous target weights
         ┌─────────────────▼────────────────────┐
         │  WS Greedy Integer Contract Optimizer │
         │  (existing v6, core enforcement,      │
         │   margin, granularity)                │
         └─────────────────┬────────────────────┘
                           │ integer contract allocations
         ┌─────────────────▼────────────────────┐
         │  NautilusTrader (Python sidecar)      │
         │  - Live-parity WS strategy backtest   │
         │  - MTM / NAV / daily snapshots        │
         │  - Pre-trade risk engine              │
         │  - IBKR order submission              │
         └─────────────────┬────────────────────┘
                           │
                    IBKR (CME/EUREX live execution)
                           │
         ┌─────────────────▼────────────────────┐
         │  Databento (FUTURE data source)       │
         │  Tick-level historical + live         │
         │  Replaces Playwright CSV scraper      │
         └──────────────────────────────────────┘

Capitalife Terminal (Next.js/Vercel) = monitoring,
  research UI, brain UI, globe, CRM, modeling studio
  ← consumes NautilusTrader state via REST bridge
```

**What does NOT change:**
- Capitalife Terminal (Next.js) — stays as primary UI and research hub
- Sentinel — stays as AI routing layer (better than LangGraph for our case)
- Brain Graph + Graphify — stays, extended with Hypothesis Registry pattern
- White Swan Dashboard, Globe, Modeling Studio, Investor CRM — all stay

---

## SUMMARY MATRIX

| Repo | Fit 0–10 | Decision | Replace | Integrate | Borrow | Risk |
|---|---|---|---|---|---|---|
| **NautilusTrader** | 8/10 | INTEGRATE | riskEngine.ts (live), TCP probe → live IBKR | As Python sidecar: execution + live-parity backtest | File-based journal pattern | Medium (v2 still RC; IB UTC timestamp config required) |
| **skfolio** | 7/10 | INTEGRATE_PARTIALLY | Nothing — integer optimizer stays | As upstream research script: CPCV, HRP target weights | CPCV workflow | Low (pure research script, zero infra) |
| **Kronos** | 3/10 | RESEARCH_EXPERIMENT_ONLY | Nothing | Not yet | Vol forecasting concept | High (GPU unknown, latency unknown, leakage risk) |
| **Vibe-Trading** | 4/10 | BORROW_IDEAS_ONLY | Nothing | Do NOT integrate (would create duplicate agent stack) | Hypothesis Registry, run manifests | Low (ideas only, no code integration) |

---

## REPO SUMMARIES

### NAUTILUSTRADER
1. **#1 gap solved:** Native Rust IBKR adapter (FUT/EUREX/CME) with paper + live mode — fills Capitalife's critical execution hole without any additional broker library
2. **Research-to-live parity:** Same Rust kernel in backtest and live trading — the daily MTM/NAV tracking in Nautilus would be more rigorous than the current `all-trades.json` composite approach
3. **Deterministic backtest:** White Swan v6 results could be independently reproduced in Nautilus (for the 2 components with trade data); seasonal components need strategy re-expression
4. **LGPL-3.0:** Proprietary WS strategies remain proprietary; only modifications to the Nautilus library itself must be shared
5. **Integration complexity:** Requires a REST/WebSocket bridge between the Python sidecar and Capitalife Terminal — non-trivial but clear architecture; start with paper mode only

### SKFOLIO
1. **CPCV is the key value:** Combinatorial Purged CV provides a distribution of OOS Sharpe ratios for all 17 WS components — directly addresses the single-split overfitting risk in v6 selection
2. **Cannot replace integer optimizer:** Continuous weight output is incompatible with futures lot constraints — the right role is upstream target-weight generator, not replacement
3. **Zero integration risk:** Can be implemented as a standalone Python research script (`pip install skfolio`, run against WS daily returns CSV) — no change to TypeScript codebase
4. **Regime-adjusted covariance:** `RegimeAdjustedEWCovariance` is a concrete improvement over the static correlation assumptions currently in v6 allocation
5. **Walk-forward built-in:** Extends existing single-OOS-split validation to a proper multi-path robustness assessment — legitimate improvement to the research process

### KRONOS
1. **Genuinely novel:** Only open-source OHLCV foundation model — pre-trained on 12B candlesticks, probabilistic vol forecasting with 9% MAE improvement vs baselines
2. **GPU requirement is a blocker:** All inference code targets `device="cuda:0"`; CPU-only is undocumented — server deployment without GPU is not confirmed feasible
3. **Inference latency unknown:** Cannot assess whether real-time signal use (e.g., daily position scaling) is practical
4. **No leakage protection:** Backtesting with Kronos requires disciplined context window management — the risk of silent look-ahead bias in the WS pipeline is non-trivial
5. **Ex-ante only:** Can NEVER replace historical WS trade P&L, seasonal evidence, or NAV — only acceptable as a forward-looking risk feature

### VIBE_TRADING
1. **Hypothesis Registry with audit ledger is real:** Hash-chained, fsync-durable, with `prev_hash_mismatch` edit detection — genuinely better than what Capitalife has (nothing)
2. **Run manifests are a good idea to port:** A JSON manifest per compute script run (hash of parameters + inputs + output KPIs) would fix the `all-trades.json` reproducibility gap — ~50 lines of code
3. **LangGraph/LangChain adds nothing:** Sentinel's architecture (multi-provider routing, budget management, tool calling, Brain RAG) is more coherent and better tested than Vibe-Trading's LangChain stack
4. **Completely different product category:** Vibe-Trading is a research agent assistant; Capitalife is a production monitoring + execution system — they serve different primary functions
5. **Knowledge graph gap exists in BOTH:** Neither has vector RAG or a proper graph DB — Vibe-Trading's FTS5 is no better than Capitalife's Graphify; the gap is ChromaDB/Qdrant, not Vibe-Trading

---

## TOP 3 CHANGES WORTH DOING

**1. NautilusTrader — IB Gateway paper mode probe**  
Install NautilusTrader in a Python venv, connect the IB adapter to IB Gateway paper mode, and execute a single FDXS futures order. This proves the execution gap is closable before any integration work begins. Expected time: 1–2 days. Risk: low. Value: confirms the path to WS live trading.

**2. skfolio CPCV — standalone WS robustness validation**  
Write a standalone Python script that runs Combinatorial Purged CV over the 17 WS component daily return series. Output: distribution of OOS Sharpe ratios, expected shortfall, and max drawdown across all path combinations. Expected time: 1 day. Risk: zero (research script, no production code changed). Value: first honest robustness estimate for WS component selection.

**3. Hypothesis Registry — Brain note template + Sentinel tool**  
Create a `HYPOTHESIS_REGISTRY.md` template in Brain and add a Sentinel tool to query/update it. Entries: hypothesis, test method, result, date, status (ACTIVE / INVALIDATED). Expected time: 0.5 days. Risk: zero. Value: makes WS research reproducible and auditable without external framework.

---

## TOP 3 THINGS NOT TO DO

**1. Do NOT integrate Vibe-Trading as a framework**  
Sentinel already does multi-provider routing, tool calling, Brain RAG, and budget management — better structured and better tested. Adding LangGraph creates a second agent stack with conflicting state, doubled LLM API surface, and significant operational complexity. The only extractable value is the Hypothesis Registry idea, which needs 50 lines of code, not a framework.

**2. Do NOT use skfolio to replace the integer contract optimizer**  
skfolio outputs continuous weights, not integer lot quantities. Replacing the v6 greedy optimizer with skfolio's MVO would break the core sleeve enforcement, IBKR margin granularity checks, and the `EXACTLY_EXECUTABLE` / `APPROXIMATELY_EXECUTABLE` classification in `execution-scaling.ts`. Use skfolio upstream as a target-weight generator, not as a replacement.

**3. Do NOT deploy Kronos in production without confirming GPU/CPU requirements and inference latency**  
The OHLCV foundation model is interesting but the operational unknowns are too large. If inference latency is >100ms on available hardware, or if GPU is mandatory for the server, it cannot function as a real-time signal. Test it in isolation (Jupyter notebook, CPU-only) before any production consideration.

---

## FINAL ARCHITECTURE RECOMMENDATION

**Short term (1–3 months):**  
Keep all existing Capitalife components. Add two lightweight Python integrations that require zero changes to the TypeScript codebase:
1. `scripts/ws-robustness-cpcv.py` — skfolio CPCV over WS daily returns → honest robustness report
2. `scripts/nautilustrader-probe/` — NautilusTrader IB adapter, paper mode, single FDXS contract

**Medium term (3–6 months):**  
If the NautilusTrader paper probe succeeds: implement NautilusTrader as a Python sidecar service (Docker container), expose REST bridge (`/orders`, `/positions`, `/nav`, `/mtm`), wire Capitalife Terminal's `TradeExecutionPanel` and `MonitoringDashboard` to consume live execution state. Run WS live on paper for 30 days before live capital.

**Long term:**  
Replace Playwright OHLCV scraper with Databento (same adapter already in NautilusTrader). Add vector RAG (ChromaDB) to Sentinel. Implement Hypothesis Registry in Brain. These three changes address the biggest remaining architecture gaps without introducing unnecessary external framework dependencies.

---

## NEXT ACTION

> **Install NautilusTrader in a Python venv and run the IBKR adapter against IB Gateway paper mode, targeting a single FDXS (mini-DAX) futures contract at EUREX. Confirm: live quote subscription works, order submission is accepted, daily MTM snapshot is written.**  
> This single probe answers whether the #1 Capitalife production gap (no live IBKR execution) can be closed with NautilusTrader — before committing to any integration work.

```bash
python -m venv .venv-nautilus
.venv-nautilus/Scripts/activate
pip install nautilus_trader
# Then implement: scripts/nautilustrader-probe/fdxs_paper_probe.py
```

No changes to existing Capitalife code required. Completely isolated test.
