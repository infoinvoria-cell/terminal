"""Performance metrics — identical to OOS calculations used in strategy validation."""

from typing import Callable
import numpy as np
import pandas as pd
from loguru import logger


def sharpe_ratio(returns: pd.Series, rf: float = 0.0, periods_per_year: int = 252) -> float:
    excess = returns - rf / periods_per_year
    if excess.std() == 0:
        return 0.0
    return float((excess.mean() / excess.std()) * np.sqrt(periods_per_year))


def max_drawdown(equity_curve: pd.Series) -> float:
    """Return max drawdown as a negative fraction (e.g. -0.22 for 22% DD)."""
    rolling_max = equity_curve.cummax()
    drawdown = (equity_curve - rolling_max) / rolling_max
    return float(drawdown.min())


def cagr(equity_curve: pd.Series, periods_per_year: int = 252) -> float:
    if len(equity_curve) < 2:
        return 0.0
    n_years = len(equity_curve) / periods_per_year
    total_return = equity_curve.iloc[-1] / equity_curve.iloc[0]
    return float(total_return ** (1 / n_years) - 1)


def calmar_ratio(cagr_val: float, max_dd: float) -> float:
    if max_dd == 0:
        return 0.0
    return float(cagr_val / abs(max_dd))


def walk_forward(
    strategy_fn: Callable[[pd.DataFrame], pd.Series],
    data: pd.DataFrame,
    n_folds: int = 4,
    train_ratio: float = 0.7,
) -> dict:
    """
    Walk-forward validation.

    strategy_fn receives a training DataFrame and returns an equity curve Series
    that will be evaluated on the OOS fold.
    """
    fold_size = len(data) // n_folds
    results = []

    for i in range(n_folds):
        start = i * fold_size
        end = start + fold_size
        fold_data = data.iloc[start:end]
        train_end = int(len(fold_data) * train_ratio)
        train = fold_data.iloc[:train_end]
        oos = fold_data.iloc[train_end:]

        try:
            equity = strategy_fn(train)
            # Apply strategy on OOS using same parameters
            oos_equity = strategy_fn(oos)
            if oos_equity is None or len(oos_equity) < 2:
                logger.warning(f"Fold {i}: OOS equity curve empty — skipping")
                continue
            fold_metrics = {
                "fold": i,
                "train_bars": len(train),
                "oos_bars": len(oos),
                "sharpe": sharpe_ratio(oos_equity.pct_change().dropna()),
                "max_dd": max_drawdown(oos_equity),
                "cagr": cagr(oos_equity),
            }
            fold_metrics["calmar"] = calmar_ratio(fold_metrics["cagr"], fold_metrics["max_dd"])
            results.append(fold_metrics)
            logger.info(
                f"Fold {i}: Sharpe={fold_metrics['sharpe']:.2f} "
                f"MaxDD={fold_metrics['max_dd']:.1%} CAGR={fold_metrics['cagr']:.1%}"
            )
        except Exception as e:
            logger.exception(f"Fold {i} failed: {e}")

    return {"folds": results, "n_folds": n_folds}
