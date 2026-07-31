"""IBKR ibapi wrapper — paper and live trading."""

import threading
import time
from typing import Optional

import pandas as pd
from ibapi.client import EClient
from ibapi.contract import Contract
from ibapi.order import Order
from ibapi.wrapper import EWrapper
from loguru import logger


class _IBKRApp(EWrapper, EClient):
    def __init__(self):
        EWrapper.__init__(self)
        EClient.__init__(self, wrapper=self)
        self._next_order_id: Optional[int] = None
        self._connected = threading.Event()
        self._historical_data: dict[int, list] = {}
        self._historical_done: dict[int, threading.Event] = {}
        self._positions: list[dict] = []
        self._positions_done = threading.Event()
        self._account_values: dict[str, str] = {}
        self._account_done = threading.Event()

    # --- EWrapper callbacks ---

    def nextValidId(self, orderId: int):
        self._next_order_id = orderId
        self._connected.set()
        logger.info(f"Connected. Next valid order ID: {orderId}")

    def error(self, reqId, errorCode, errorString, advancedOrderRejectJson=""):
        if errorCode in (2104, 2106, 2158):
            logger.debug(f"[{reqId}] IBKR info {errorCode}: {errorString}")
        else:
            logger.error(f"[{reqId}] IBKR error {errorCode}: {errorString}")

    def historicalData(self, reqId, bar):
        if reqId not in self._historical_data:
            self._historical_data[reqId] = []
        self._historical_data[reqId].append({
            "date": bar.date,
            "open": bar.open,
            "high": bar.high,
            "low": bar.low,
            "close": bar.close,
            "volume": bar.volume,
        })

    def historicalDataEnd(self, reqId, start, end):
        logger.debug(f"Historical data complete for reqId={reqId}")
        if reqId in self._historical_done:
            self._historical_done[reqId].set()

    def position(self, account, contract, pos, avgCost):
        self._positions.append({
            "symbol": contract.symbol,
            "sec_type": contract.secType,
            "exchange": contract.exchange,
            "currency": contract.currency,
            "position": pos,
            "avg_cost": avgCost,
        })

    def positionEnd(self):
        self._positions_done.set()

    def accountSummary(self, reqId, account, tag, value, currency):
        self._account_values[tag] = value

    def accountSummaryEnd(self, reqId):
        self._account_done.set()


class IBKRConnection:
    """High-level IBKR connection manager."""

    def __init__(self, host: str = "127.0.0.1", port: int = 7497, client_id: int = 1):
        self._host = host
        self._port = port
        self._client_id = client_id
        self._app: Optional[_IBKRApp] = None
        self._thread: Optional[threading.Thread] = None
        self._req_counter = 1

    def _next_req_id(self) -> int:
        rid = self._req_counter
        self._req_counter += 1
        return rid

    def connect(self, timeout: int = 30) -> bool:
        try:
            self._app = _IBKRApp()
            self._app.connect(self._host, self._port, self._client_id)
            self._thread = threading.Thread(target=self._app.run, daemon=True)
            self._thread.start()
            connected = self._app._connected.wait(timeout=timeout)
            if not connected:
                logger.error(f"Timed out connecting to IBKR at {self._host}:{self._port}")
                return False
            logger.info(f"IBKR connected — {self._host}:{self._port} client_id={self._client_id}")
            return True
        except Exception as e:
            logger.exception(f"IBKR connect failed: {e}")
            return False

    def disconnect(self):
        try:
            if self._app and self._app.isConnected():
                self._app.disconnect()
                logger.info("IBKR disconnected")
        except Exception as e:
            logger.exception(f"IBKR disconnect error: {e}")

    def get_historical_data(
        self,
        symbol: str,
        duration: str = "1 Y",
        bar_size: str = "1 day",
        sec_type: str = "STK",
        exchange: str = "SMART",
        currency: str = "USD",
        timeout: int = 60,
    ) -> Optional[pd.DataFrame]:
        if not self._app or not self._app.isConnected():
            logger.error("Not connected to IBKR")
            return None
        try:
            rid = self._next_req_id()
            contract = self._build_contract(symbol, sec_type, exchange, currency)
            self._app._historical_data[rid] = []
            done_event = threading.Event()
            self._app._historical_done[rid] = done_event

            self._app.reqHistoricalData(
                rid, contract, "", duration, bar_size,
                "TRADES", 1, 1, False, []
            )
            if not done_event.wait(timeout=timeout):
                logger.error(f"Historical data timeout for {symbol}")
                return None

            rows = self._app._historical_data.pop(rid, [])
            if not rows:
                logger.warning(f"No historical data returned for {symbol}")
                return None
            df = pd.DataFrame(rows)
            df["date"] = pd.to_datetime(df["date"])
            df.set_index("date", inplace=True)
            logger.info(f"Fetched {len(df)} bars for {symbol} ({bar_size})")
            return df
        except Exception as e:
            logger.exception(f"get_historical_data failed for {symbol}: {e}")
            return None

    def place_order(
        self,
        symbol: str,
        action: str,
        quantity: float,
        order_type: str = "MKT",
        limit_price: Optional[float] = None,
        sec_type: str = "STK",
        exchange: str = "SMART",
        currency: str = "USD",
    ) -> Optional[int]:
        if not self._app or not self._app.isConnected():
            logger.error("Not connected to IBKR")
            return None
        try:
            order_id = self._app._next_order_id
            self._app._next_order_id += 1
            contract = self._build_contract(symbol, sec_type, exchange, currency)
            order = Order()
            order.action = action.upper()
            order.totalQuantity = quantity
            order.orderType = order_type.upper()
            if limit_price is not None:
                order.lmtPrice = limit_price
            self._app.placeOrder(order_id, contract, order)
            logger.info(f"Order placed: {action} {quantity} {symbol} @ {order_type} — order_id={order_id}")
            return order_id
        except Exception as e:
            logger.exception(f"place_order failed for {symbol}: {e}")
            return None

    def get_positions(self, timeout: int = 10) -> list[dict]:
        if not self._app or not self._app.isConnected():
            logger.error("Not connected to IBKR")
            return []
        try:
            self._app._positions = []
            self._app._positions_done.clear()
            self._app.reqPositions()
            self._app._positions_done.wait(timeout=timeout)
            self._app.cancelPositions()
            return list(self._app._positions)
        except Exception as e:
            logger.exception(f"get_positions failed: {e}")
            return []

    def get_account_value(self, tag: str = "NetLiquidation", timeout: int = 10) -> Optional[str]:
        if not self._app or not self._app.isConnected():
            logger.error("Not connected to IBKR")
            return None
        try:
            rid = self._next_req_id()
            self._app._account_values = {}
            self._app._account_done.clear()
            self._app.reqAccountSummary(rid, "All", tag)
            self._app._account_done.wait(timeout=timeout)
            self._app.cancelAccountSummary(rid)
            return self._app._account_values.get(tag)
        except Exception as e:
            logger.exception(f"get_account_value failed: {e}")
            return None

    @staticmethod
    def _build_contract(symbol: str, sec_type: str, exchange: str, currency: str) -> Contract:
        c = Contract()
        c.symbol = symbol
        c.secType = sec_type
        c.exchange = exchange
        c.currency = currency
        return c
