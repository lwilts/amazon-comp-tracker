from __future__ import annotations

import logging
import os
from datetime import date
from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from .models import Base, RSUVest

logger = logging.getLogger(__name__)

DATA_DIR = os.environ.get("DATA_DIR", "/data")
DATABASE_URL = f"sqlite:///{DATA_DIR}/db.sqlite"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialised")


def lock_historical_vests(db: Session) -> int:
    """
    Find all past unlocked vests and lock them using EOD historical prices.
    Returns the number of vests locked.
    """
    from .price_fetcher import fetch_historical_prices

    today = date.today()
    past_unlocked = (
        db.query(RSUVest)
        .filter(RSUVest.vest_date < today, RSUVest.is_locked == False)  # noqa: E712
        .all()
    )

    locked = 0
    for vest in past_unlocked:
        prices = fetch_historical_prices(vest.vest_date)
        if prices is None:
            logger.warning("Could not fetch historical prices for vest id=%d date=%s", vest.id, vest.vest_date)
            continue
        vest.locked_price_usd = round(prices.amzn_usd, 2)
        vest.locked_fx_rate = round(prices.usd_gbp, 6)
        vest.locked_value_gbp = round(vest.shares * prices.amzn_usd * prices.usd_gbp, 2)
        vest.is_locked = True
        vest.manually_overridden = False
        locked += 1
        logger.info(
            "Historically locked vest id=%d (%s): %d shares @ $%.2f → £%.2f",
            vest.id, vest.vest_date, vest.shares, prices.amzn_usd, vest.locked_value_gbp,
        )

    if locked:
        db.commit()
    return locked


def unlock_vest(db: Session, vest_id: int) -> RSUVest:
    from .price_fetcher import fetch_historical_prices

    vest = db.get(RSUVest, vest_id)
    if vest is None:
        raise ValueError(f"Vest {vest_id} not found")

    today = date.today()
    if vest.vest_date < today:
        prices = fetch_historical_prices(vest.vest_date)
        if prices:
            vest.locked_price_usd = round(prices.amzn_usd, 2)
            vest.locked_fx_rate = round(prices.usd_gbp, 6)
            vest.locked_value_gbp = round(vest.shares * prices.amzn_usd * prices.usd_gbp, 2)
            vest.is_locked = True
        vest.manually_overridden = False
    else:
        vest.locked_price_usd = None
        vest.locked_fx_rate = None
        vest.locked_value_gbp = None
        vest.is_locked = False
        vest.manually_overridden = False

    db.commit()
    db.refresh(vest)
    return vest
