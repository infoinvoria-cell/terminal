# Capitalife Trading Engine

Institutional-grade Python trading engine — IBKR-ready, Haftungsdach-konform.

## Stack

| Layer | Library |
|-------|---------|
| Backtesting | vectorbt |
| Live execution | IBKR ibapi (official) |
| Data | pandas / numpy |
| Data sources | yfinance + IBKR historical |
| Logging | loguru |
| Config | PyYAML |

## Setup

```bash
cd engine
pip install -r requirements.txt
```

> **Note:** `ibapi` must be installed from the official TWS API package, not PyPI:
> 1. Download TWS API from https://interactivebrokers.github.io/
> 2. Run `cd IBJts/source/pythonclient && python setup.py install`

## Running a Backtest

```bash
# From the repo root
python -c "
from engine.backtest.runner import run_backtest
result = run_backtest('core_invest', start='2019-01-01')
m = result['metrics']
print(f'CAGR: {m[\"cagr\"]:.1%}  Sharpe: {m[\"sharpe\"]:.2f}  MaxDD: {m[\"max_drawdown\"]:.1%}  Calmar: {m[\"calmar\"]:.2f}')
"
```

**Expected Core Invest metrics (2019–2025):**

| Metric | Target | Tolerance |
|--------|--------|-----------|
| CAGR   | ~17%   | ±10%      |
| Sharpe | ~1.15  | ±10%      |
| MaxDD  | ~−22%  | ±10%      |

If any metric deviates more than 10% from target, investigate before using live.

## Running Live Trading (Paper first)

### 1. Start TWS or IB Gateway in Paper Trading mode

TWS Paper API endpoint: `127.0.0.1:7497`

### 2. Connect and run

```python
from engine.live.ibkr_connection import IBKRConnection
from engine.live.risk_manager import RiskManager
from engine.live.order_manager import OrderManager
from engine.live.signal_bridge import SignalBridge, Signal

ibkr = IBKRConnection(host="127.0.0.1", port=7497, client_id=1)
ibkr.connect()

risk = RiskManager(max_risk_pct=0.01)          # 1% max risk per trade
order_mgr = OrderManager(ibkr, risk)
bridge = SignalBridge(order_mgr)

# Update account state before dispatching
account_value = float(ibkr.get_account_value("NetLiquidation"))
positions = ibkr.get_positions()
bridge.update_account_state(account_value, len(positions))

# Dispatch a signal
signal = Signal(
    symbol="SPY",
    direction="long",
    entry_price=450.0,
    stop_price=441.0,   # defines position size
    strategy="core_invest",
)
bridge.dispatch(signal)

ibkr.disconnect()
```

### IBKR API Endpoints

| Mode | App | Port |
|------|-----|------|
| Paper | TWS | 7497 |
| Live  | TWS | 7496 |
| Paper | IB Gateway | 4002 |
| Live  | IB Gateway | 4001 |

## Risk Rules

- Max **1% of account value** at risk per trade (hard-coded in `RiskManager`)
- Max 20 open positions at any time
- No single order may exceed 25% of account value
- Paper mode first — validate every strategy on paper for at least 30 trading days before live

## File Structure

```
engine/
├── backtest/
│   ├── runner.py          # Orchestrates backtests
│   ├── metrics.py         # Sharpe, Calmar, MaxDD, Walk-Forward
│   └── strategies/        # One file per strategy
├── live/
│   ├── ibkr_connection.py # IBKR ibapi wrapper
│   ├── order_manager.py   # Executes sized orders
│   ├── risk_manager.py    # Position sizing & approval
│   └── signal_bridge.py   # Strategy signal → IBKR order
├── data/
│   ├── fetcher.py         # yfinance + IBKR historical
│   └── live_feed.py       # IBKR real-time ticks
└── config/
    ├── strategies.yaml    # Per-strategy parameters
    └── ibkr.yaml          # Connection config
```
