from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

try:
    from tvDatafeed import Interval, TvDatafeedLive
except Exception as exc:  # pragma: no cover
    print(f"tv_live_worker import failed: {exc}", file=sys.stderr)
    sys.exit(2)


INTERVAL_MAP = {
    "1m": Interval.in_1_minute,
    "3m": Interval.in_3_minute,
    "5m": Interval.in_5_minute,
    "15m": Interval.in_15_minute,
    "30m": Interval.in_30_minute,
    "45m": Interval.in_45_minute,
    "1h": Interval.in_1_hour,
    "2h": Interval.in_2_hour,
    "3h": Interval.in_3_hour,
    "4h": Interval.in_4_hour,
    "1D": Interval.in_daily,
    "1W": Interval.in_weekly,
    "1M": Interval.in_monthly,
}


def load_env() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    load_dotenv(repo_root / ".env.local")
    load_dotenv(repo_root / ".env")


def get_cache_dir() -> Path:
    repo_root = Path(__file__).resolve().parents[2]
    raw = os.getenv("TRADINGVIEW_CACHE_DIR", ".capitalife-cache/market-data/tradingview")
    return (repo_root / raw).resolve()


def build_client():
    username = os.getenv("TRADINGVIEW_USERNAME", "").strip()
    password = os.getenv("TRADINGVIEW_PASSWORD", "").strip()
    if username and password:
        return TvDatafeedLive(username, password), "login"
    return TvDatafeedLive(), "nologin"


def write_latest(symbol: str, exchange: str, interval: str, data) -> None:
    latest_dir = get_cache_dir() / "latest"
    latest_dir.mkdir(parents=True, exist_ok=True)
    first_row = data.iloc[0]
    payload = {
        "symbol": symbol,
        "exchange": exchange,
        "interval": interval,
        "source": "tradingview-datafeed",
        "feed": "TradingView latest bar",
        "mode": "near-live",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bar": {
            "date": str(first_row.name.to_pydatetime().date()),
            "open": float(first_row["open"]),
            "high": float(first_row["high"]),
            "low": float(first_row["low"]),
            "close": float(first_row["close"]),
            "volume": None if "volume" not in first_row else float(first_row["volume"]),
        },
    }
    with (latest_dir / f"{symbol}.json").open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--exchange", required=True)
    parser.add_argument("--interval", default="1D")
    args = parser.parse_args()

    load_env()
    if os.getenv("TRADINGVIEW_ENABLE_LIVE", "false").lower() != "true":
        print("TRADINGVIEW_ENABLE_LIVE=false; worker not started")
        return 0

    client, auth_mode = build_client()
    seis = client.new_seis(args.symbol, args.exchange, INTERVAL_MAP[args.interval])

    def consumer(seis_obj, data):
        write_latest(seis_obj.symbol, seis_obj.exchange, args.interval, data)
        print(f"updated latest bar: {seis_obj.symbol} {seis_obj.exchange} {args.interval} auth={auth_mode}")

    seis.new_consumer(consumer)
    print("TvDatafeedLive worker running; latest bars only, no execution.")
    while True:
        time.sleep(60)


if __name__ == "__main__":
    sys.exit(main())
