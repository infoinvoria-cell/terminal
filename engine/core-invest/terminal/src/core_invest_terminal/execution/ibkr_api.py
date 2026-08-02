"""Minimal synchronous facade over the official Interactive Brokers Python API.

This module is intentionally isolated from the research engine. Importing the
research package never opens a network connection. The broker adapter only
connects to localhost TWS/IB Gateway and defaults to preview/non-transmit.
"""
from __future__ import annotations

import math
import threading
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, Optional

try:
    from ibapi.client import EClient
    from ibapi.wrapper import EWrapper
    from ibapi.contract import Contract, ContractDetails
    from ibapi.order import Order
    from ibapi.order_state import OrderState
    from ibapi.execution import Execution
    IBAPI_AVAILABLE = True
except ImportError:  # pragma: no cover - target environment dependency
    class _MissingClient: pass
    class _MissingWrapper: pass
    EClient = _MissingClient
    EWrapper = _MissingWrapper
    Contract = Any
    ContractDetails = Any
    Order = Any
    OrderState = Any
    Execution = Any
    IBAPI_AVAILABLE = False


@dataclass
class BrokerPosition:
    account: str
    con_id: int
    symbol: str
    local_symbol: str
    sec_type: str
    exchange: str
    currency: str
    quantity: float
    average_cost: float


class IBKRClient(EWrapper, EClient):  # type: ignore[misc]
    def __init__(self):
        if not IBAPI_AVAILABLE:
            raise RuntimeError("Official IBKR Python API is not installed. Install the TWS API package first.")
        EWrapper.__init__(self)
        EClient.__init__(self, self)
        self._thread: Optional[threading.Thread] = None
        self._next_order_id: Optional[int] = None
        self._connected = threading.Event()
        self._events: Dict[tuple[str, int], threading.Event] = {}
        self._contract_details: Dict[int, list] = defaultdict(list)
        self._historical: Dict[int, list] = defaultdict(list)
        self._account_values: Dict[int, dict] = defaultdict(dict)
        self._positions: list[BrokerPosition] = []
        self._position_event = threading.Event()
        self._order_states: Dict[int, Any] = {}
        self._order_status: Dict[int, dict] = {}
        self._executions: Dict[str, dict] = {}
        self._commissions: Dict[str, dict] = {}
        self.errors: list[dict] = []
        self._req_id = 1000

    def _new_id(self) -> int:
        self._req_id += 1
        return self._req_id

    def _event(self, kind: str, req_id: int) -> threading.Event:
        key = (kind, req_id)
        self._events[key] = threading.Event()
        return self._events[key]

    def connect_and_start(self, host: str, port: int, client_id: int, timeout: float = 15.0) -> None:
        if host not in {"127.0.0.1", "localhost", "::1"}:
            raise RuntimeError("Non-localhost IBKR connections are disabled by policy")
        self.connect(host, port, clientId=client_id)
        self._thread = threading.Thread(target=self.run, daemon=True, name="ibkr-api-loop")
        self._thread.start()
        if not self._connected.wait(timeout):
            self.disconnect()
            raise TimeoutError("IBKR nextValidId not received")

    def close(self) -> None:
        if self.isConnected():
            self.disconnect()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)

    # --- callbacks ---
    def nextValidId(self, orderId: int):
        self._next_order_id = orderId
        self._connected.set()

    def error(self, reqId, errorCode, errorString, advancedOrderRejectJson=""):
        self.errors.append({"reqId": reqId, "code": errorCode, "message": errorString, "advanced": advancedOrderRejectJson})
        # Common informational farm-connectivity messages must not abort requests.
        if errorCode not in {2104, 2106, 2107, 2108, 2158}:
            ev = self._events.get(("error", int(reqId)))
            if ev:
                ev.set()

    def contractDetails(self, reqId: int, contractDetails: ContractDetails):
        self._contract_details[reqId].append(contractDetails)

    def contractDetailsEnd(self, reqId: int):
        self._events[("contract", reqId)].set()

    def historicalData(self, reqId, bar):
        self._historical[reqId].append(bar)

    def historicalDataEnd(self, reqId, start, end):
        self._events[("historical", reqId)].set()

    def accountSummary(self, reqId, account, tag, value, currency):
        self._account_values[reqId][(account, tag, currency)] = value

    def accountSummaryEnd(self, reqId):
        self._events[("account", reqId)].set()

    def position(self, account, contract, position, avgCost):
        self._positions.append(BrokerPosition(
            account=account, con_id=int(contract.conId), symbol=contract.symbol,
            local_symbol=contract.localSymbol, sec_type=contract.secType,
            exchange=contract.exchange, currency=contract.currency,
            quantity=float(position), average_cost=float(avgCost),
        ))

    def positionEnd(self):
        self._position_event.set()

    def openOrder(self, orderId, contract, order, orderState):
        self._order_states[int(orderId)] = orderState
        ev = self._events.get(("whatif", int(orderId)))
        if ev:
            ev.set()

    def orderStatus(self, orderId, status, filled, remaining, avgFillPrice, permId,
                    parentId, lastFillPrice, clientId, whyHeld, mktCapPrice=0.0):
        self._order_status[int(orderId)] = {
            "status": status, "filled": float(filled), "remaining": float(remaining),
            "avgFillPrice": float(avgFillPrice), "lastFillPrice": float(lastFillPrice),
            "whyHeld": whyHeld,
        }
        if status in {"Filled", "Cancelled", "ApiCancelled", "Inactive"}:
            ev = self._events.get(("order", int(orderId)))
            if ev:
                ev.set()

    def execDetails(self, reqId, contract, execution: Execution):
        self._executions[execution.execId] = {
            "reqId": reqId, "conId": int(contract.conId), "localSymbol": contract.localSymbol,
            "side": execution.side, "shares": float(execution.shares), "price": float(execution.price),
            "time": execution.time, "orderId": int(execution.orderId),
        }

    def commissionReport(self, commissionReport):
        self._commissions[commissionReport.execId] = {
            "commission": float(commissionReport.commission), "currency": commissionReport.currency,
            "realizedPNL": float(commissionReport.realizedPNL) if math.isfinite(float(commissionReport.realizedPNL)) else None,
        }

    # Newer API callback name; keep compatibility with legacy versions.
    def commissionAndFeesReport(self, report):  # pragma: no cover - API-version dependent
        self.commissionReport(report)

    # --- synchronous methods ---
    def contract_details_sync(self, contract: Contract, timeout: float = 20.0) -> list:
        req_id = self._new_id()
        ev = self._event("contract", req_id)
        self.reqContractDetails(req_id, contract)
        if not ev.wait(timeout):
            raise TimeoutError(f"Contract details timeout for {getattr(contract, 'symbol', '')}")
        return self._contract_details.pop(req_id, [])

    def historical_daily_sync(self, contract: Contract, duration: str = "1 Y", what: str = "TRADES", use_rth: bool = False, timeout: float = 30.0) -> list:
        req_id = self._new_id()
        ev = self._event("historical", req_id)
        self.reqHistoricalData(req_id, contract, "", duration, "1 day", what, int(use_rth), 1, False, [])
        if not ev.wait(timeout):
            self.cancelHistoricalData(req_id)
            raise TimeoutError(f"Historical data timeout for {getattr(contract, 'localSymbol', '') or getattr(contract, 'symbol', '')}")
        return self._historical.pop(req_id, [])

    def account_summary_sync(self, account: str, timeout: float = 15.0) -> dict:
        req_id = self._new_id()
        ev = self._event("account", req_id)
        self.reqAccountSummary(req_id, "All", "NetLiquidation,AvailableFunds,ExcessLiquidity,InitMarginReq,MaintMarginReq")
        if not ev.wait(timeout):
            self.cancelAccountSummary(req_id)
            raise TimeoutError("Account summary timeout")
        self.cancelAccountSummary(req_id)
        values = self._account_values.pop(req_id, {})
        result = {}
        for (acct, tag, currency), value in values.items():
            if account and acct != account:
                continue
            if currency in {"BASE", "USD", ""}:
                try:
                    result[tag] = float(value)
                except ValueError:
                    pass
        return result

    def positions_sync(self, timeout: float = 15.0) -> list[BrokerPosition]:
        self._positions = []
        self._position_event.clear()
        self.reqPositions()
        if not self._position_event.wait(timeout):
            self.cancelPositions()
            raise TimeoutError("Positions timeout")
        self.cancelPositions()
        return list(self._positions)

    def next_order_id(self) -> int:
        if self._next_order_id is None:
            raise RuntimeError("No nextValidId")
        oid = self._next_order_id
        self._next_order_id += 1
        return oid

    def what_if_sync(self, contract: Contract, order: Order, timeout: float = 20.0) -> dict:
        order_id = self.next_order_id()
        order.orderId = order_id
        order.whatIf = True
        order.transmit = False
        ev = self._event("whatif", order_id)
        self.placeOrder(order_id, contract, order)
        if not ev.wait(timeout):
            raise TimeoutError(f"WhatIf timeout order {order_id}")
        state = self._order_states.get(order_id)
        def number(name):
            try:
                value = getattr(state, name)
                return float(value) if value not in {None, "", "1.7976931348623157E308"} else None
            except Exception:
                return None
        return {
            "order_id": order_id, "init_margin_before": number("initMarginBefore"),
            "init_margin_change": number("initMarginChange"), "init_margin_after": number("initMarginAfter"),
            "maint_margin_change": number("maintMarginChange"),
            "equity_with_loan_change": number("equityWithLoanChange"),
            "commission_min": number("minCommission"), "commission_max": number("maxCommission"),
            "warning": getattr(state, "warningText", "") if state else "",
        }

    def transmit_sync(self, contract: Contract, order: Order, timeout: float = 120.0) -> dict:
        order_id = self.next_order_id()
        order.orderId = order_id
        order.whatIf = False
        order.transmit = True
        ev = self._event("order", order_id)
        self.placeOrder(order_id, contract, order)
        ev.wait(timeout)
        return {"order_id": order_id, **self._order_status.get(order_id, {"status": "UNKNOWN"})}


def stock_contract(symbol: str, primary_exchange: str = "") -> Contract:
    c = Contract()
    c.symbol = symbol
    c.secType = "STK"
    c.exchange = "SMART"
    c.currency = "USD"
    if primary_exchange:
        c.primaryExchange = primary_exchange
    return c


def futures_query(symbol: str, exchange: str) -> Contract:
    c = Contract()
    c.symbol = symbol
    c.secType = "FUT"
    c.exchange = exchange
    c.currency = "USD"
    c.includeExpired = False
    return c


def market_order(action: str, quantity: float, account: str, *, transmit: bool = False, order_ref: str = "") -> Order:
    o = Order()
    o.action = action
    o.orderType = "MKT"
    o.totalQuantity = Decimal(str(abs(quantity)))
    o.account = account
    o.transmit = transmit
    o.tif = "DAY"
    o.orderRef = order_ref
    return o


def expiry_from_details(details) -> date:
    raw = getattr(details, "realExpirationDate", "") or getattr(details.contract, "lastTradeDateOrContractMonth", "")
    raw = str(raw).replace("-", "")
    if len(raw) >= 8:
        return datetime.strptime(raw[:8], "%Y%m%d").date()
    if len(raw) == 6:
        y, m = int(raw[:4]), int(raw[4:6])
        first_next = date(y + (m == 12), 1 if m == 12 else m + 1, 1)
        return first_next.fromordinal(first_next.toordinal() - 1)
    raise ValueError(f"Cannot parse expiry: {raw}")


def business_days_until(expiry: date) -> int:
    return int(max(0, __import__("numpy").busday_count(__import__("numpy").datetime64(datetime.now(timezone.utc).date()), __import__("numpy").datetime64(expiry))))
