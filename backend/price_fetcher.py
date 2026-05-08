from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class PriceData:
    amzn_usd: float
    usd_gbp: float
    fetched_at: datetime


def _latest_close(ticker_symbol: str) -> Optional[float]:
    """Fetch the most recent closing price via the chart API (avoids quoteSummary rate limits)."""
    import yfinance as yf
    hist = yf.Ticker(ticker_symbol).history(period="5d", interval="1h", auto_adjust=True)
    if hist.empty:
        return None
    series = hist["Close"].dropna()
    if series.empty:
        return None
    return float(series.iloc[-1])


def fetch_historical_prices(target_date) -> Optional[PriceData]:
    """Fetch EOD closing prices for the nearest trading day on or before target_date."""
    from datetime import timedelta
    try:
        import yfinance as yf

        # Fetch a window ending on target_date — iloc[-1] gives the last trading day in range
        start = target_date - timedelta(days=7)
        end = target_date + timedelta(days=1)

        amzn_hist = yf.Ticker("AMZN").history(start=start, end=end, interval="1d", auto_adjust=True)
        gbpusd_hist = yf.Ticker("GBPUSD=X").history(start=start, end=end, interval="1d", auto_adjust=True)

        if amzn_hist.empty or gbpusd_hist.empty:
            logger.warning("No historical data found around %s", target_date)
            return None

        amzn_price = float(amzn_hist["Close"].dropna().iloc[-1])
        gbpusd_rate = float(gbpusd_hist["Close"].dropna().iloc[-1])

        return PriceData(
            amzn_usd=amzn_price,
            usd_gbp=1.0 / gbpusd_rate,
            fetched_at=datetime.now(timezone.utc),
        )
    except Exception:
        logger.exception("Historical price fetch failed for %s", target_date)
        return None


def fetch_prices() -> Optional[PriceData]:
    try:
        amzn_price = _latest_close("AMZN")
        gbpusd_rate = _latest_close("GBPUSD=X")

        if amzn_price is None or gbpusd_rate is None:
            logger.warning("Price fetch returned None values: amzn=%s gbpusd=%s", amzn_price, gbpusd_rate)
            return None

        return PriceData(
            amzn_usd=amzn_price,
            usd_gbp=1.0 / gbpusd_rate,
            fetched_at=datetime.now(timezone.utc),
        )
    except Exception:
        logger.exception("Price fetch failed")
        return None
