from pathlib import Path
import argparse, json, sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "03_TERMINAL_ENGINE/src"))
from core_invest_terminal.backtrader_replay import run_target_replay
parser = argparse.ArgumentParser()
parser.add_argument("--cash", type=float, default=25000)
parser.add_argument("--plot", action="store_true")
args = parser.parse_args()
print(json.dumps(run_target_replay(ROOT, cash=args.cash, plot=args.plot), default=str, indent=2))
