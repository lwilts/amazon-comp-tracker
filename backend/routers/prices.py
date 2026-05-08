from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import PriceHistory, RSUVest
from ..price_fetcher import fetch_prices
from ..schemas import PriceResponse

router = APIRouter(dependencies=[Depends(require_auth)])
logger = logging.getLogger(__name__)


def _latest_price(db: Session):
    return db.query(PriceHistory).order_by(PriceHistory.fetched_at.desc()).first()


@router.get("/current", response_model=PriceResponse)
async def get_current_price(db: Session = Depends(get_db)):
    latest = _latest_price(db)
    if not latest:
        raise HTTPException(status_code=404, detail="No price data yet — trigger a refresh")
    return PriceResponse(
        amzn_usd=latest.amzn_usd,
        usd_gbp=latest.usd_gbp,
        fetched_at=latest.fetched_at,
        amzn_gbp=round(latest.amzn_usd * latest.usd_gbp, 2),
    )


@router.post("/refresh", response_model=PriceResponse)
async def refresh_price(db: Session = Depends(get_db)):
    result = fetch_prices()
    if result is None:
        raise HTTPException(status_code=503, detail="Price fetch failed — check server logs")

    db.add(PriceHistory(
        fetched_at=result.fetched_at,
        amzn_usd=result.amzn_usd,
        usd_gbp=result.usd_gbp,
    ))

    # Auto-lock today's vests
    today = date.today()
    vests_to_lock = (
        db.query(RSUVest)
        .filter(RSUVest.vest_date == today, RSUVest.is_locked == False)  # noqa: E712
        .all()
    )
    for vest in vests_to_lock:
        vest.locked_price_usd = result.amzn_usd
        vest.locked_fx_rate = result.usd_gbp
        vest.locked_value_gbp = round(vest.shares * result.amzn_usd * result.usd_gbp, 2)
        vest.is_locked = True
        logger.info("Auto-locked vest id=%d on manual refresh", vest.id)

    db.commit()

    return PriceResponse(
        amzn_usd=result.amzn_usd,
        usd_gbp=result.usd_gbp,
        fetched_at=result.fetched_at,
        amzn_gbp=round(result.amzn_usd * result.usd_gbp, 2),
    )
