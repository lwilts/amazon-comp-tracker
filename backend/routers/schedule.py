from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import AppConfig, BonusConfig, PriceHistory, RSUVest, SalaryConfig
from ..schemas import (
    PayLineItem,
    ScheduleResponse,
    TaxYearBlock,
    TaxYearSubtotals,
)

router = APIRouter(dependencies=[Depends(require_auth)])

PRORATION_PAY_DATE = date(2025, 11, 28)
PRORATION_FACTOR = 14 / 30


def tax_year_for(d: date) -> str:
    if d.month > 4 or (d.month == 4 and d.day >= 6):
        start = d.year
    else:
        start = d.year - 1
    return f"{start}/{str(start + 1)[2:]}"


def _month_iter(start: date, end: date):
    """Yield the 28th of each month from start's month through end's month."""
    y, m = start.year, start.month
    while True:
        pay_date = date(y, m, 28)
        if pay_date > end:
            break
        yield pay_date
        m += 1
        if m > 12:
            m = 1
            y += 1


def compute_schedule(
    db: Session,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
) -> ScheduleResponse:
    # Employment start date
    cfg = db.get(AppConfig, "employment_start_date")
    employment_start = date.fromisoformat(cfg.value) if cfg else date(2025, 11, 17)

    # Latest price for RSU estimation
    latest_price = db.query(PriceHistory).order_by(PriceHistory.fetched_at.desc()).first()

    # Load all configs
    salary_configs = db.query(SalaryConfig).all()
    bonus_configs = db.query(BonusConfig).all()
    rsu_vests = db.query(RSUVest).all()

    # Date range
    start = from_date or employment_start
    if to_date:
        end = to_date
    else:
        vest_dates = [v.vest_date for v in rsu_vests]
        latest = max(vest_dates) if vest_dates else date.today()
        end = max(latest, date.today()) + timedelta(days=365 * 2)

    line_items: List[PayLineItem] = []

    # Salary + bonus items
    for pay_date in _month_iter(start, end):
        for sc in salary_configs:
            if sc.effective_from <= pay_date and (sc.effective_to is None or sc.effective_to >= pay_date):
                monthly = sc.annual_amount / 12
                if pay_date == PRORATION_PAY_DATE:
                    monthly = monthly * PRORATION_FACTOR
                line_items.append(PayLineItem(
                    line_date=pay_date,
                    pay_date=pay_date,
                    type="salary",
                    description=f"Base salary{' (' + sc.notes + ')' if sc.notes else ''}",
                    cash_gbp=round(monthly, 2),
                    is_estimated=False,
                    status="confirmed",
                    tax_year=tax_year_for(pay_date),
                ))

        for bc in bonus_configs:
            if bc.effective_from <= pay_date and (bc.effective_to is None or bc.effective_to >= pay_date):
                pay_months = json.loads(bc.pay_months or "[]")
                if bc.frequency == "monthly":
                    amount = bc.annual_amount / 12
                elif bc.frequency == "quarterly":
                    if pay_date.month not in pay_months:
                        continue
                    amount = bc.annual_amount / 4
                elif bc.frequency == "annual":
                    if pay_date.month not in pay_months:
                        continue
                    amount = bc.annual_amount
                elif bc.frequency == "custom":
                    if not pay_months or pay_date.month not in pay_months:
                        continue
                    amount = bc.annual_amount / len(pay_months)
                else:
                    continue
                line_items.append(PayLineItem(
                    line_date=pay_date,
                    pay_date=pay_date,
                    type="bonus",
                    description=bc.name,
                    cash_gbp=round(amount, 2),
                    is_estimated=False,
                    status="confirmed",
                    tax_year=tax_year_for(pay_date),
                ))

    # RSU vest items
    for vest in rsu_vests:
        if vest.is_locked:
            value_gbp = vest.locked_value_gbp
            status = "manual" if vest.manually_overridden else "locked"
            is_estimated = False
        else:
            if latest_price is not None:
                value_gbp = round(vest.shares * latest_price.amzn_usd * latest_price.usd_gbp, 2)
            else:
                value_gbp = None
            status = "estimated"
            is_estimated = True

        line_items.append(PayLineItem(
            line_date=vest.vest_date,
            pay_date=vest.vest_date,
            type="rsu",
            description=f"RSU vest — {vest.award.award_ref} ({vest.shares} shares)",
            rsu_shares=vest.shares,
            rsu_value_gbp=value_gbp,
            is_estimated=is_estimated,
            status=status,
            tax_year=tax_year_for(vest.vest_date),
        ))

    line_items.sort(key=lambda x: x.line_date)

    # Group by tax year
    by_year: dict[str, List[PayLineItem]] = defaultdict(list)
    for item in line_items:
        by_year[item.tax_year].append(item)

    tax_year_blocks = []
    for ty in sorted(by_year.keys()):
        lines = by_year[ty]
        base_salary = sum(i.cash_gbp for i in lines if i.type == "salary" and i.cash_gbp)
        bonus = sum(i.cash_gbp for i in lines if i.type == "bonus" and i.cash_gbp)
        rsu = sum(i.rsu_value_gbp for i in lines if i.type == "rsu" and i.rsu_value_gbp)
        total_cash = base_salary + bonus
        tax_year_blocks.append(TaxYearBlock(
            tax_year=ty,
            lines=lines,
            subtotals=TaxYearSubtotals(
                base_salary=round(base_salary, 2),
                bonus=round(bonus, 2),
                rsu=round(rsu, 2),
                total_cash=round(total_cash, 2),
                total_inc_rsu=round(total_cash + rsu, 2),
            ),
        ))

    return ScheduleResponse(tax_years=tax_year_blocks)


@router.get("", response_model=ScheduleResponse)
async def get_schedule(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    return compute_schedule(db, from_date, to_date)
