from __future__ import annotations
import json
from pathlib import Path
from .execution.planner import build_orders, scaled_targets
from .execution.validation import validate_plan, validate_reference_hashes


def load_execution_bundle(package_root: Path):
    base = package_root / "02_RESEARCH_REFERENCE/Core_Invest_Demo_Forward_Ready_1"
    plan = json.loads((base / "reference/current_execution_plan_25k.json").read_text(encoding="utf-8"))
    config = json.loads((base / "config/execution_config.json").read_text(encoding="utf-8"))
    return base, plan, config


def validate_execution_bundle(package_root: Path, allow_stale: bool = True):
    base, plan, config = load_execution_bundle(package_root)
    warnings = validate_plan(plan, config, allow_stale=allow_stale)
    validate_reference_hashes(base, plan)
    return warnings
