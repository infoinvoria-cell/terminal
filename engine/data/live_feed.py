"""Live price feed via IBKR market data subscriptions."""

import threading
from typing import Callable, Optional

from ibapi.contract import Contract
from loguru import logger

from ..live.ibkr_connection import IBKRConnection, _IBKRApp


class LiveFeed:
    """Subscribe to IBKR real-time ticks and invoke a callback on each price update."""

    def __init__(self, ibkr: IBKRConnection):
        self.ibkr = ibkr
        self._callbacks: dict[int, Callable[[str, float], None]] = {}
        self._req_to_symbol: dict[int, str] = {}
        self._lock = threading.Lock()
        self._patch_app()

    def _patch_app(self):
        """Monkey-patch tickPrice onto the running app instance."""
        feed = self

        def tick_price(wrapper_self, reqId, tickType, price, attrib):
            # tickType 4 = last price
            if tickType == 4 and price > 0:
                sym = feed._req_to_symbol.get(reqId)
                cb = feed._callbacks.get(reqId)
                if sym and cb:
                    cb(sym, price)

        if self.ibkr._app:
            import types
            self.ibkr._app.tickPrice = types.MethodType(tick_price, self.ibkr._app)

    def subscribe(self, symbol: str, callback: Callable[[str, float], None], sec_type: str = "STK", exchange: str = "SMART", currency: str = "USD") -> Optional[int]:
        if not self.ibkr._app or not self.ibkr._app.isConnected():
            logger.error("Not connected")
            return None
        rid = self.ibkr._next_req_id()
        contract = IBKRConnection._build_contract(symbol, sec_type, exchange, currency)
        with self._lock:
            self._callbacks[rid] = callback
            self._req_to_symbol[rid] = symbol
        self.ibkr._app.reqMktData(rid, contract, "", False, False, [])
        logger.info(f"Live feed subscribed: {symbol} (reqId={rid})")
        return rid

    def unsubscribe(self, req_id: int):
        if self.ibkr._app:
            self.ibkr._app.cancelMktData(req_id)
        with self._lock:
            self._callbacks.pop(req_id, None)
            self._req_to_symbol.pop(req_id, None)
        logger.info(f"Live feed unsubscribed reqId={req_id}")
