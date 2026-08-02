from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "03_TERMINAL_ENGINE/src"))
from core_invest_terminal.snapshot import write_snapshot
write_snapshot(ROOT, ROOT / "06_ANALYTICS_INTEGRATION/examples/analytics_snapshot.generated.json")
print(ROOT / "06_ANALYTICS_INTEGRATION/examples/analytics_snapshot.generated.json")
