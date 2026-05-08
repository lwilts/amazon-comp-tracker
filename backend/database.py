from __future__ import annotations

import json
import logging
import os
from datetime import date
from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from .models import (
    AppConfig,
    Base,
    BonusConfig,
    RSUAward,
    RSUVest,
    SalaryConfig,
)

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


def seed_data(db: Session) -> None:
    existing = db.get(AppConfig, "seeded")
    if existing:
        return

    try:
        _do_seed(db)
        db.add(AppConfig(key="seeded", value="true"))
        db.add(AppConfig(key="employment_start_date", value="2025-01-06"))
        db.commit()
        logger.info("Seed data inserted successfully")
    except Exception:
        db.rollback()
        logger.exception("Failed to seed data — continuing without seed")


def _do_seed(db: Session) -> None:
    # Example salary — replace with your own values via the UI
    db.add(SalaryConfig(
        annual_amount=75000.0,
        effective_from=date(2025, 1, 28),
        effective_to=None,
        notes="Example — update via Salary page",
    ))

    # Example bonuses
    db.add(BonusConfig(
        name="Sign-on Year 1",
        annual_amount=10000.0,
        frequency="monthly",
        pay_months="[]",
        effective_from=date(2025, 1, 28),
        effective_to=date(2025, 12, 28),
        notes="",
    ))
    db.add(BonusConfig(
        name="Sign-on Year 2",
        annual_amount=5000.0,
        frequency="monthly",
        pay_months="[]",
        effective_from=date(2026, 1, 28),
        effective_to=date(2026, 12, 28),
        notes="",
    ))
    db.add(BonusConfig(
        name="Performance Bonus",
        annual_amount=8000.0,
        frequency="quarterly",
        pay_months=json.dumps([1, 4, 7, 10]),
        effective_from=date(2026, 1, 28),
        effective_to=None,
        notes="",
    ))

    # Example RSU award
    award = RSUAward(
        award_ref="GRANT-2025-A",
        grant_date=date(2025, 1, 6),
        notes="Example grant — update via RSU Awards page",
    )
    db.add(award)
    db.flush()  # get award.id

    vest_schedule = [
        (date(2026, 1, 6),  10),
        (date(2027, 1, 6),  20),
        (date(2027, 7, 6),  25),
        (date(2028, 1, 6),  25),
        (date(2028, 7, 6),  25),
        (date(2029, 1, 6),  25),
    ]
    for vest_date, shares in vest_schedule:
        db.add(RSUVest(
            award_id=award.id,
            vest_date=vest_date,
            shares=shares,
            is_locked=False,
            manually_overridden=False,
        ))


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
