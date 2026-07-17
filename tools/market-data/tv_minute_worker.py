from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path


def build_command(args: argparse.Namespace) -> list[str]:
    script = Path(__file__).with_name("tv_datafeed_collector.py")
    command = [
        sys.executable,
        str(script),
        "--symbols",
        *args.symbols,
        "--intervals",
        *args.intervals,
        "--n-bars",
        str(args.n_bars),
    ]
    if args.no_login:
        command.append("--no-login")
    if args.search:
        command.append("--search")
    return command


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", nargs="+", default=["SPY", "SPMO", "QQQ", "GLD", "NAS100USD"])
    parser.add_argument("--interval", default="1m")
    parser.add_argument("--history-interval", action="append", default=["1D"])
    parser.add_argument("--poll-seconds", type=int, default=60)
    parser.add_argument("--n-bars", type=int, default=5000)
    parser.add_argument("--no-login", action="store_true")
    parser.add_argument("--search", action="store_true")
    args = parser.parse_args()

    intervals = [args.interval, *args.history_interval]
    args.intervals = list(dict.fromkeys(intervals))

    while True:
        started = time.time()
        result = subprocess.run(build_command(args), check=False)
        elapsed = time.time() - started
        wait_seconds = max(args.poll_seconds - elapsed, 0)
        if result.returncode != 0:
            print(f"[tv_minute_worker] collector exit={result.returncode}; retry in {int(max(wait_seconds, 5))}s")
        time.sleep(max(wait_seconds, 5))


if __name__ == "__main__":
    raise SystemExit(main())
