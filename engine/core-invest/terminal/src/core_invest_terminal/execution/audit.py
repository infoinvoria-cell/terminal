"""Local SQLite audit/state store. No telemetry and no remote writes."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  profile TEXT NOT NULL,
  mode TEXT NOT NULL,
  account_hash TEXT,
  nav REAL NOT NULL,
  status TEXT NOT NULL,
  config_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  asset TEXT NOT NULL,
  security_type TEXT NOT NULL,
  con_id INTEGER,
  local_symbol TEXT,
  action TEXT NOT NULL,
  quantity REAL NOT NULL,
  order_type TEXT NOT NULL,
  limit_price REAL,
  reason TEXT NOT NULL,
  margin_change REAL,
  status TEXT NOT NULL,
  PRIMARY KEY(run_id, sequence)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fee_state (
  sleeve_id TEXT PRIMARY KEY,
  units REAL NOT NULL,
  nav_per_unit REAL NOT NULL,
  high_water_mark_per_unit REAL NOT NULL,
  accrued_fee REAL NOT NULL,
  updated_at TEXT NOT NULL
);
"""


def account_hash(account: str) -> str:
    if not account:
        return ""
    return hashlib.sha256(account.encode("utf-8")).hexdigest()[:16]


class AuditDB:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.conn = sqlite3.connect(path)
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def create_run(self, run_id: str, profile: str, mode: str, account: str, nav: float, config: dict) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO runs VALUES(?,?,?,?,?,?,?,?)",
            (run_id, datetime.now(timezone.utc).isoformat(), profile, mode, account_hash(account), nav, "CREATED", json.dumps(config, sort_keys=True)),
        )
        self.conn.commit()

    def set_status(self, run_id: str, status: str) -> None:
        self.conn.execute("UPDATE runs SET status=? WHERE run_id=?", (status, run_id))
        self.conn.commit()

    def add_plan(self, run_id: str, rows: Iterable[dict]) -> None:
        for i, row in enumerate(rows, start=1):
            self.conn.execute(
                """INSERT OR REPLACE INTO plans
                (run_id,sequence,asset,security_type,con_id,local_symbol,action,quantity,order_type,limit_price,reason,margin_change,status)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (run_id, i, row.get("asset"), row.get("security_type"), row.get("con_id"), row.get("local_symbol"),
                 row.get("action"), row.get("quantity"), row.get("order_type", "MKT"), row.get("limit_price"),
                 row.get("reason", "rebalance"), row.get("margin_change"), row.get("status", "PLANNED")),
            )
        self.conn.commit()

    def event(self, run_id: str, event_type: str, payload: Any) -> None:
        self.conn.execute(
            "INSERT INTO events(run_id,created_at,event_type,payload_json) VALUES(?,?,?,?)",
            (run_id, datetime.now(timezone.utc).isoformat(), event_type, json.dumps(payload, default=str, sort_keys=True)),
        )
        self.conn.commit()
