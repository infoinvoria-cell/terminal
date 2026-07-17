from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from dotenv import load_dotenv

try:
    from tvDatafeed import Interval, TvDatafeed
except Exception as exc:  # pragma: no cover
    print(f"tv_datafeed import failed: {exc}", file=sys.stderr)
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

# Cache lives outside the repo. Override with TRADINGVIEW_CACHE_DIR; the fallback
# is a sibling of the repo root (tools/market-data/ -> two levels up -> alongside).
_TV_CACHE_ENV = (os.environ.get("TRADINGVIEW_CACHE_DIR") or "").strip()
CENTRAL_CACHE_DIR = (
    Path(_TV_CACHE_ENV)
    if _TV_CACHE_ENV
    else Path(__file__).resolve().parents[2] / ".capitalife-cache" / "market-data" / "tradingview"
)


@dataclass
class SymbolMapping:
    symbol: str
    exchange_candidates: list[str]
    role: str
    required_for: list[str]
    resolved_exchange: str | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_env() -> None:
    root = repo_root()
    load_dotenv(root / ".env.local")
    load_dotenv(root / ".env")


def default_cache_dir() -> Path:
    raw = os.getenv("TRADINGVIEW_CACHE_DIR", str(CENTRAL_CACHE_DIR))
    return Path(raw).expanduser().resolve()


def fallback_manifest_path() -> Path:
    return repo_root() / "src" / "data" / "capitalife" / "market-data" / "tradingview" / "manifest.json"


def fallback_status_path() -> Path:
    return repo_root() / "src" / "data" / "capitalife" / "market-data" / "tradingview" / "status.json"


def symbol_mapping_path() -> Path:
    return repo_root() / "src" / "data" / "capitalife" / "market-data" / "tradingview-symbols.json"


def load_symbol_mappings() -> dict[str, SymbolMapping]:
    raw = json.loads(symbol_mapping_path().read_text(encoding="utf-8"))
    mappings: dict[str, SymbolMapping] = {}
    for key, value in raw.items():
        mappings[key] = SymbolMapping(
            symbol=value["symbol"],
            exchange_candidates=value.get("exchange_candidates", []),
            role=value.get("role", ""),
            required_for=value.get("required_for", []),
            resolved_exchange=value.get("resolved_exchange"),
        )
    return mappings


def save_symbol_mappings(mappings: dict[str, SymbolMapping]) -> None:
    existing = json.loads(symbol_mapping_path().read_text(encoding="utf-8"))
    for key, mapping in mappings.items():
        existing.setdefault(key, {})
        existing[key]["resolved_exchange"] = mapping.resolved_exchange
    symbol_mapping_path().write_text(json.dumps(existing, indent=2), encoding="utf-8")


def build_client(no_login: bool) -> tuple[TvDatafeed, str]:
    username = os.getenv("TRADINGVIEW_USERNAME", "").strip()
    password = os.getenv("TRADINGVIEW_PASSWORD", "").strip()
    if no_login or not username or not password:
        return TvDatafeed(), "nologin"
    return TvDatafeed(username, password), "login"


def choose_exchange(tv: TvDatafeed, mapping: SymbolMapping, do_search: bool) -> str | None:
    if mapping.resolved_exchange:
        return mapping.resolved_exchange
    if not do_search:
        return mapping.exchange_candidates[0] if mapping.exchange_candidates else None
    for candidate in mapping.exchange_candidates:
        try:
            results = tv.search_symbol(mapping.symbol, candidate)
            if results:
                mapping.resolved_exchange = candidate
                return candidate
        except Exception:
            continue
    return mapping.exchange_candidates[0] if mapping.exchange_candidates else None


def normalize_date(value: Any, interval: str) -> str:
    timestamp = pd.to_datetime(value, utc=True)
    if interval == "1D":
      return timestamp.strftime("%Y-%m-%dT00:00:00Z")
    return timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_frame(frame: pd.DataFrame, symbol: str, exchange: str, interval: str, fetched_at: str) -> dict[str, Any]:
    if frame is None or frame.empty:
        return {"bars": [], "rows": 0, "first_date": None, "last_date": None}
    normalized = frame.reset_index()
    normalized = normalized.rename(columns={normalized.columns[0]: "date"})
    normalized["date"] = normalized["date"].apply(lambda value: normalize_date(value, interval))
    normalized["volume"] = normalized["volume"] if "volume" in normalized.columns else None
    bars = []
    for row in normalized.to_dict(orient="records"):
        bars.append(
            {
                "date": row["date"],
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": None if pd.isna(row.get("volume")) else float(row.get("volume")),
                "symbol": symbol,
                "exchange": exchange,
                "interval": interval,
                "source": "tradingview-datafeed",
                "fetched_at": fetched_at,
            }
        )
    bars = sorted({bar["date"]: bar for bar in bars}.values(), key=lambda item: item["date"])
    return {
        "bars": bars,
        "rows": len(bars),
        "first_date": bars[0]["date"] if bars else None,
        "last_date": bars[-1]["date"] if bars else None,
    }


def write_json(target: Path, payload: Any) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_existing_latest(cache_dir: Path, symbol: str) -> dict[str, Any] | None:
    target = cache_dir / "latest" / f"{symbol}.json"
    if not target.exists():
        return None
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_latest(cache_dir: Path, symbol: str, payload: dict[str, Any], symbol_status: str) -> None:
    latest_bar = payload["bars"][-1] if payload["bars"] else None
    previous_bar = payload["bars"][-2] if len(payload["bars"]) > 1 else None
    latest_payload = {
        "symbol": symbol,
        "exchange": payload.get("exchange"),
        "interval": payload.get("interval"),
        "source": "tradingview-datafeed",
        "mode": "delayed_near_live",
        "fetched_at": payload.get("fetched_at"),
        "bar_time": latest_bar["date"] if latest_bar else None,
        "open": latest_bar["open"] if latest_bar else None,
        "high": latest_bar["high"] if latest_bar else None,
        "low": latest_bar["low"] if latest_bar else None,
        "close": latest_bar["close"] if latest_bar else None,
        "volume": latest_bar.get("volume") if latest_bar else None,
        "status": symbol_status,
        "previous_close": previous_bar["close"] if previous_bar else None,
        "change": (latest_bar["close"] - previous_bar["close"]) if latest_bar and previous_bar else None,
        "change_pct": (((latest_bar["close"] / previous_bar["close"]) - 1) * 100) if latest_bar and previous_bar and previous_bar["close"] else None,
    }
    write_json(cache_dir / "latest" / f"{symbol}.json", latest_payload)


def load_config(config_path: str | None) -> dict[str, Any]:
    if not config_path:
        return {}
    path = Path(config_path)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def compute_symbol_status(intervals: dict[str, dict[str, Any]]) -> tuple[str, str | None]:
    values = list(intervals.values())
    if any(item["status"] == "ok" for item in values):
        return "ok", None
    if any(item["status"] == "error" for item in values):
        error = next((item["error"] for item in values if item["error"]), "fetch_failed")
        return "error", error
    if any(item["status"] == "stale" for item in values):
        return "stale", None
    return "missing", None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", nargs="*", default=[])
    parser.add_argument("--interval", default=None)
    parser.add_argument("--intervals", nargs="*", default=[])
    parser.add_argument("--n-bars", type=int, default=None)
    parser.add_argument("--output-cache", default=None)
    parser.add_argument("--config", default=None)
    parser.add_argument("--no-login", action="store_true")
    parser.add_argument("--search", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    load_env()
    config = load_config(args.config)
    cache_dir = Path(args.output_cache).resolve() if args.output_cache else default_cache_dir()
    cache_dir.mkdir(parents=True, exist_ok=True)

    symbols = args.symbols or config.get("symbols") or ["SPY", "SPMO", "QQQ", "GLD", "NAS100USD"]
    intervals = args.intervals or ([args.interval] if args.interval else []) or config.get("intervals") or ["1m", "1D"]
    n_bars = args.n_bars or int(config.get("n_bars") or os.getenv("TRADINGVIEW_DEFAULT_N_BARS", "5000"))
    poll_seconds = int(config.get("poll_seconds") or os.getenv("TRADINGVIEW_POLL_SECONDS", "60"))
    stale_after_seconds = int(config.get("stale_after_seconds") or os.getenv("TRADINGVIEW_STALE_AFTER_SECONDS", "180"))

    tv, auth_mode = build_client(args.no_login)
    mappings = load_symbol_mappings()
    manifest_updated_at = utc_now()

    manifest: dict[str, Any] = {
        "source": "tradingview-datafeed",
        "package": "tradingview-datafeed",
        "auth_mode": auth_mode,
        "cache_dir": str(cache_dir),
        "updated_at": manifest_updated_at,
        "poll_seconds": poll_seconds,
        "stale_after_seconds": stale_after_seconds,
        "warning": "TradingView nologin may limit symbols" if auth_mode == "nologin" else None,
        "symbols": {},
    }
    success_count = 0

    for symbol in symbols:
        symbol_manifest: dict[str, Any] = {"intervals": {}}
        mapping = mappings.get(symbol)
        if not mapping:
            symbol_manifest.update({"status": "error", "error": "symbol_not_in_mapping"})
            manifest["symbols"][symbol] = symbol_manifest
            continue

        exchange = choose_exchange(tv, mapping, args.search or bool(config.get("search")))
        if exchange:
            mapping.resolved_exchange = exchange

        latest_payload_for_symbol: dict[str, Any] | None = None

        for interval in intervals:
            fetched_at = utc_now()
            entry = {
                "symbol": symbol,
                "exchange": exchange,
                "interval": interval,
                "rows": 0,
                "first_date": None,
                "last_date": None,
                "fetched_at": fetched_at,
                "auth_mode": auth_mode,
                "status": "missing",
                "error": None,
                "path": None,
            }
            if not exchange:
                entry["status"] = "error"
                entry["error"] = "no_exchange_mapping"
                symbol_manifest["intervals"][interval] = entry
                continue
            try:
                frame = tv.get_hist(symbol=symbol, exchange=exchange, interval=INTERVAL_MAP[interval], n_bars=n_bars)
                normalized = normalize_frame(frame, symbol, exchange, interval, fetched_at)
                payload = {
                    "symbol": symbol,
                    "exchange": exchange,
                    "interval": interval,
                    "source": "tradingview-datafeed",
                    "fetched_at": fetched_at,
                    "auth_mode": auth_mode,
                    "bars": normalized["bars"],
                }
                out_path = cache_dir / "history" / f"{symbol}_{interval}.json"
                write_json(out_path, payload)
                entry.update(
                    {
                        "rows": normalized["rows"],
                        "first_date": normalized["first_date"],
                        "last_date": normalized["last_date"],
                        "status": "ok" if normalized["rows"] > 0 else "missing",
                        "path": str(out_path),
                    }
                )
                if normalized["rows"] > 0:
                    latest_payload_for_symbol = payload if interval == "1m" else latest_payload_for_symbol or payload
                    success_count += 1
            except Exception as exc:
                entry["status"] = "error"
                entry["error"] = str(exc)
            symbol_manifest["intervals"][interval] = entry

        symbol_status, symbol_error = compute_symbol_status(symbol_manifest["intervals"])
        symbol_manifest["status"] = symbol_status
        symbol_manifest["error"] = symbol_error
        symbol_manifest["last_bar_time"] = (
            symbol_manifest["intervals"].get("1m", {}).get("last_date")
            or symbol_manifest["intervals"].get("1D", {}).get("last_date")
        )
        symbol_manifest["last_fetch"] = (
            symbol_manifest["intervals"].get("1m", {}).get("fetched_at")
            or symbol_manifest["intervals"].get("1D", {}).get("fetched_at")
        )
        symbol_manifest["rows_1m"] = symbol_manifest["intervals"].get("1m", {}).get("rows", 0)
        symbol_manifest["rows_1D"] = symbol_manifest["intervals"].get("1D", {}).get("rows", 0)

        if latest_payload_for_symbol and symbol_status in {"ok", "stale"}:
            write_latest(cache_dir, symbol, latest_payload_for_symbol, symbol_status)
        elif symbol_status in {"error", "missing"}:
            existing_latest = load_existing_latest(cache_dir, symbol)
            if existing_latest:
                existing_latest["status"] = symbol_status
                existing_latest["fetched_at"] = symbol_manifest["last_fetch"]
                write_json(cache_dir / "latest" / f"{symbol}.json", existing_latest)

        manifest["symbols"][symbol] = symbol_manifest

    save_symbol_mappings(mappings)

    symbol_states = [item["status"] for item in manifest["symbols"].values()]
    overall_status = "error" if "error" in symbol_states else "ok" if "ok" in symbol_states else "missing"
    status_payload = {
        "source": manifest["source"],
        "auth_mode": auth_mode,
        "cache_dir": str(cache_dir),
        "updated_at": manifest_updated_at,
        "poll_seconds": poll_seconds,
        "stale_after_seconds": stale_after_seconds,
        "overall_status": overall_status,
        "warning": manifest["warning"],
        "symbols": manifest["symbols"],
    }

    write_json(cache_dir / "manifest.json", manifest)
    write_json(cache_dir / "status.json", status_payload)
    write_json(fallback_manifest_path(), manifest)
    write_json(fallback_status_path(), status_payload)

    print(json.dumps({"manifest": str(cache_dir / "manifest.json"), "success_count": success_count, "auth_mode": auth_mode}, indent=2))
    if success_count == 0 or (args.strict and any(s["status"] != "ok" for s in manifest["symbols"].values())):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
