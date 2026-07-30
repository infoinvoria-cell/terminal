"""
seed_anomaly_daily.py
Fetch daily OHLC for GC1! (Gold), YM1! (Dow), GLD from Yahoo Finance
and upsert into monitoring_ohlc.  No TradingView login needed.

Yahoo tickers:
  GC1!  -> GC=F  (Gold Continuous)
  YM1!  -> YM=F  (Dow Jones Mini Continuous)
  GLD   -> GLD   (SPDR Gold ETF)
"""
from __future__ import annotations
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("Installing yfinance...")
    os.system(f"{sys.executable} -m pip install yfinance -q")
    import yfinance as yf

from dotenv import load_dotenv
try:
    from supabase import create_client
except ImportError:
    os.system(f"{sys.executable} -m pip install supabase -q")
    from supabase import create_client

REPO = Path(__file__).resolve().parents[2]
load_dotenv(REPO / ".env.local")

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
db = create_client(SUPABASE_URL, SERVICE_KEY)

# Known price floors per asset.
# Any bar whose close falls below this floor is rejected before upsert —
# it indicates a Yahoo Finance auto_adjust ratio-splice artifact or a wrong
# ticker mapping, not a real market price.
#
# YM1!  (Dow Jones E-mini, CBOT): first trade 1997 ~7 000 pts; current ~40 000–53 000
# GC1!  (Gold Continuous, COMEX): 1970s low ~$100; current ~$3 000–$5 000
# GLD   (SPDR Gold ETF, NYSE Arca): tracks ~1/10 gold; floor $50 (gold ~$500 era)
#
# These floors are intentionally conservative (well below any plausible real price)
# so that real extreme market events are never blocked.
PRICE_FLOOR: dict[str, float] = {
    "YM1!": 5_000.0,
    "GC1!":   100.0,
    "GLD":     50.0,
}

TARGETS = [
    {"asset": "GC1!",  "yahoo": "GC=F",  "tf": "D"},
    {"asset": "YM1!",  "yahoo": "YM=F",  "tf": "D"},
    {"asset": "GLD",   "yahoo": "GLD",   "tf": "D"},
]

def fetch(yahoo_ticker: str, n: int = 2000):
    t = yf.Ticker(yahoo_ticker)
    df = t.history(period="max", interval="1d", auto_adjust=True)
    df = df.dropna(subset=["Open","High","Low","Close"])
    df = df[df["Close"] > 0]
    return df.tail(n)

def upsert(asset: str, tf: str, df):
    floor = PRICE_FLOOR.get(asset, 0.0)
    rows = []
    rejected = 0
    for ts, row in df.iterrows():
        date = ts.strftime("%Y-%m-%d")
        o, h, l, c = float(row["Open"]), float(row["High"]), float(row["Low"]), float(row["Close"])
        if l > h: h, l = l, h      # sanity swap
        if o <= 0 or c <= 0: continue
        if c < floor:
            rejected += 1
            print(f"  ⛔ {asset} {date}  close={c:.2f} < floor {floor} — rejected (scale error)")
            continue
        rows.append({"asset": asset, "timeframe": tf, "date": date,
                     "open": o, "high": h, "low": l, "close": c, "volume": None})
    if rejected:
        print(f"  ⚠️  {asset}: {rejected} row(s) rejected by price-floor guard (floor={floor})")
    BATCH = 500
    n = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        db.table("monitoring_ohlc").upsert(chunk, on_conflict="asset,timeframe,date").execute()
        n += len(chunk)
    return n

for t in TARGETS:
    try:
        df = fetch(t["yahoo"])
        if df.empty:
            print(f"  ⚠️  {t['asset']} — no data from Yahoo ({t['yahoo']})")
            continue
        n = upsert(t["asset"], t["tf"], df)
        first = df.index[0].strftime("%Y-%m-%d")
        last  = df.index[-1].strftime("%Y-%m-%d")
        print(f"  ✅  {t['asset']:8s} {n:5d} bars  [{first} → {last}]  src=yahoo/{t['yahoo']}")
    except Exception as e:
        print(f"  ❌  {t['asset']}: {e}")

print("\nDone.")
