"""Backtest runner — orchestrates strategy execution and metric reporting."""

import importlib
from pathlib import Path
from typing import Optional

import pandas as pd
import yaml
from loguru import logger

from .metrics import sharpe_ratio, max_drawdown, cagr, calmar_ratio


STRATEGIES_DIR = Path(__file__).parent / "strategies"


def run_backtest(
    strategy_name: str,
    start: str = "2019-01-01",
    end: Optional[str] = None,
    config_path: Optional[Path] = None,
) -> dict:
    logger.info(f"Running backtest: {strategy_name} ({start} → {end or 'today'})")

    # Load strategy config
    cfg = {}
    if config_path is None:
        config_path = Path(__file__).parent.parent / "config" / "strategies.yaml"
    if config_path.exists():
        with open(config_path) as f:
            all_cfg = yaml.safe_load(f)
        cfg = all_cfg.get(strategy_name, {})

    # Import strategy module
    try:
        module = importlib.import_module(f"engine.backtest.strategies.{strategy_name}")
    except ModuleNotFoundError:
        logger.error(f"Strategy module not found: {strategy_name}")
        return {"error": f"Strategy '{strategy_name}' not found"}

    if not hasattr(module, "run"):
        logger.error(f"Strategy {strategy_name} missing run() function")
        return {"error": "Strategy missing run() function"}

    result = module.run(start=start, end=end, config=cfg)

    # Standardised metric output
    equity: pd.Series = result.get("equity")
    if equity is not None and len(equity) > 1:
        returns = equity.pct_change().dropna()
        _cagr = cagr(equity)
        _mdd = max_drawdown(equity)
        result["metrics"] = {
            "cagr": _cagr,
            "sharpe": sharpe_ratio(returns),
            "max_drawdown": _mdd,
            "calmar": calmar_ratio(_cagr, _mdd),
        }
        logger.info(
            f"[{strategy_name}] CAGR={_cagr:.1%} Sharpe={result['metrics']['sharpe']:.2f} "
            f"MaxDD={_mdd:.1%} Calmar={result['metrics']['calmar']:.2f}"
        )

    return result
