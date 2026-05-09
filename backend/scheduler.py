from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")


def price_fetch_job() -> None:
    from .database import SessionLocal
    from .models import PriceHistory, RSUVest
    from .price_fetcher import fetch_prices

    result = fetch_prices()
    if result is None:
        logger.warning("Scheduled price fetch returned no data")
        return

    db = SessionLocal()
    try:
        db.add(PriceHistory(
            fetched_at=result.fetched_at,
            amzn_usd=result.amzn_usd,
            usd_gbp=result.usd_gbp,
        ))

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
            logger.info(
                "Auto-locked vest id=%d: %d shares @ $%.2f → £%.2f",
                vest.id, vest.shares, result.amzn_usd, vest.locked_value_gbp,
            )

        db.commit()
        logger.info(
            "Price fetched: AMZN=$%.2f USD/GBP=%.4f (locked %d vest(s))",
            result.amzn_usd, result.usd_gbp, len(vests_to_lock),
        )
    except Exception:
        db.rollback()
        logger.exception("Error saving price fetch result")
    finally:
        db.close()


def start_scheduler() -> None:
    scheduler.add_job(
        price_fetch_job,
        CronTrigger(
            day_of_week="mon-fri",
            hour="14,15,16,17,18,19,20,21",
            minute="0,30",
            timezone="UTC",
        ),
        id="price_fetch",
        replace_existing=True,
        next_run_time=datetime.now(tz=timezone.utc),  # fetch immediately on startup
    )
    scheduler.start()
    logger.info("Scheduler started — price fetch runs every 30 min Mon-Fri 14:00-21:30 UTC")


def stop_scheduler() -> None:
    try:
        scheduler.shutdown(wait=False)
    except Exception:
        pass
