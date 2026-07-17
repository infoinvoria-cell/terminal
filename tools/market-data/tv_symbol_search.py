from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from tvDatafeed import TvDatafeed


def load_env() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    load_dotenv(repo_root / ".env.local")
    load_dotenv(repo_root / ".env")


def build_client(no_login: bool) -> TvDatafeed:
    username = os.getenv("TRADINGVIEW_USERNAME", "").strip()
    password = os.getenv("TRADINGVIEW_PASSWORD", "").strip()
    if no_login or not username or not password:
      return TvDatafeed()
    return TvDatafeed(username, password)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--exchange", default=None)
    parser.add_argument("--no-login", action="store_true")
    args = parser.parse_args()

    load_env()
    client = build_client(args.no_login)
    results = client.search_symbol(args.symbol, args.exchange)
    print(json.dumps(results, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
