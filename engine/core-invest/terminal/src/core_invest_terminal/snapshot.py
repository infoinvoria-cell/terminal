from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd


def _records(path: Path) -> list[dict]:
    return pd.read_csv(path).replace({float("nan"): None}).to_dict(orient="records")


def build_snapshot(package_root: Path) -> dict:
    reference = package_root / "02_RESEARCH_REFERENCE/Core_Invest_Demo_Forward_Ready_1/reference"
    plan = json.loads((reference / "current_execution_plan_25k.json").read_text(encoding="utf-8"))
    summary = json.loads((reference / "research_summary.json").read_text(encoding="utf-8"))
    release = _records(reference / "release_gates.csv")
    annual = _records(reference / "annual_performance.csv")
    rolling = _records(reference / "rolling_summary.csv")
    costs = _records(reference / "cost_sensitivity.csv")
    return {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "strategy": {
            "name": "Core Invest",
            "research_id": plan["strategy_id"],
            "research_version": plan["strategy_version"],
            "execution_release": plan["execution_release"],
            "mode": plan["mode"],
            "as_of": plan["as_of"],
            "reference_nav": plan["reference_nav"],
        },
        "performance": {"core_investor_net": summary["full"], "spy": summary["spy"], "recent_2021_2026": summary["recent_2021_2026"]},
        "rolling_validation": {"outperformance_5y": summary["rolling_5y"], "outperformance_10y": summary["rolling_10y"], "summary_rows": rolling},
        "allocation": {
            "etf_weights": plan["etf_weights"],
            "cash_financing_weight": plan["cash_financing_weight"],
            "gross_long_exposure": plan["gross_long_exposure"],
            "futures_targets": plan["futures_targets"],
        },
        "annual_performance": annual,
        "cost_stress": costs,
        "release_gates": release,
        "approval": plan["approval"],
        "alerts": [row for row in release if row.get("status") == "FAIL"],
    }


def write_snapshot(package_root: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(build_snapshot(package_root), indent=2, default=str), encoding="utf-8")
