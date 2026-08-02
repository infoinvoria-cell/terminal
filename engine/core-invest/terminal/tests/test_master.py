from pathlib import Path
import json, sys
import pandas as pd
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "03_TERMINAL_ENGINE/src"))
from core_invest_terminal.data import read_tradingview_csv, validate_ohlc
from core_invest_terminal.fees import quarterly_hwm_fee
from core_invest_terminal.snapshot import build_snapshot
from core_invest_terminal.plan import validate_execution_bundle


def test_snapshot():
    snapshot = build_snapshot(ROOT)
    assert snapshot["strategy"]["name"] == "Core Invest"
    assert snapshot["approval"]["live_allowed"] is False


def test_plan_and_hashes():
    warnings = validate_execution_bundle(ROOT, allow_stale=True)
    assert isinstance(warnings, list)


def test_data_sample():
    df = read_tradingview_csv(ROOT / "01_DATA/canonical/SPY.csv")
    assert len(df) > 1000
    assert validate_ohlc(df) == []


def test_fee_hwm():
    idx = pd.bdate_range("2024-01-01", periods=130)
    ret = pd.Series(0.001, index=idx)
    net, ledger = quarterly_hwm_fee(ret)
    assert (ledger["fee"] >= 0).all()
    assert ledger["high_water_mark"].is_monotonic_increasing
