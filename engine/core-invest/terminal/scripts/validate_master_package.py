from pathlib import Path
import csv, hashlib, json, sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "03_TERMINAL_ENGINE/src"))
from core_invest_terminal.plan import validate_execution_bundle
warnings = validate_execution_bundle(ROOT, allow_stale=True)
manifest = ROOT / "PACKAGE_MANIFEST_SHA256.csv"
errors = []
with manifest.open(newline="", encoding="utf-8-sig") as file:
    for row in csv.DictReader(file):
        path = ROOT / row["path"]
        if not path.exists():
            errors.append(f"missing {row['path']}")
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != row["sha256"]:
            errors.append(f"hash mismatch {row['path']}")
print(json.dumps({"warnings": warnings, "manifest_errors": errors}, indent=2))
raise SystemExit(1 if errors else 0)
