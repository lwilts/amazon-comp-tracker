from __future__ import annotations

import logging
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db, lock_historical_vests, unlock_vest as _db_unlock_vest
from ..models import RSUAward, RSUVest

logger = logging.getLogger(__name__)
from ..schemas import (
    RSUAwardCreate,
    RSUAwardResponse,
    RSUAwardUpdate,
    RSUVestCreate,
    RSUVestLockRequest,
    RSUVestResponse,
    RSUVestUpdate,
)

router = APIRouter(dependencies=[Depends(require_auth)])


def _get_award_or_404(db: Session, id: int) -> RSUAward:
    obj = db.get(RSUAward, id)
    if obj is None:
        raise HTTPException(status_code=404, detail="RSU award not found")
    return obj


def _get_vest_or_404(db: Session, id: int) -> RSUVest:
    obj = db.get(RSUVest, id)
    if obj is None:
        raise HTTPException(status_code=404, detail="RSU vest not found")
    return obj


# ─── Awards ───────────────────────────────────────────────────────────────────

@router.get("/awards", response_model=List[RSUAwardResponse])
async def list_awards(db: Session = Depends(get_db)):
    return db.query(RSUAward).order_by(RSUAward.grant_date).all()


@router.post("/awards", response_model=RSUAwardResponse, status_code=201)
async def create_award(body: RSUAwardCreate, db: Session = Depends(get_db)):
    obj = RSUAward(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/awards/{id}", response_model=RSUAwardResponse)
async def update_award(id: int, body: RSUAwardUpdate, db: Session = Depends(get_db)):
    obj = _get_award_or_404(db, id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/awards/{id}", status_code=204)
async def delete_award(id: int, db: Session = Depends(get_db)):
    obj = _get_award_or_404(db, id)
    db.delete(obj)
    db.commit()


# ─── Vests ────────────────────────────────────────────────────────────────────

@router.get("/vests", response_model=List[RSUVestResponse])
async def list_vests(db: Session = Depends(get_db)):
    return db.query(RSUVest).order_by(RSUVest.vest_date).all()


@router.post("/vests", response_model=RSUVestResponse, status_code=201)
async def create_vest(body: RSUVestCreate, db: Session = Depends(get_db)):
    _get_award_or_404(db, body.award_id)
    obj = RSUVest(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/vests/{id}", response_model=RSUVestResponse)
async def update_vest(id: int, body: RSUVestUpdate, db: Session = Depends(get_db)):
    obj = _get_vest_or_404(db, id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/vests/{id}", status_code=204)
async def delete_vest(id: int, db: Session = Depends(get_db)):
    obj = _get_vest_or_404(db, id)
    db.delete(obj)
    db.commit()


@router.post("/vests/{id}/lock", response_model=RSUVestResponse)
async def lock_vest(id: int, body: RSUVestLockRequest, db: Session = Depends(get_db)):
    obj = _get_vest_or_404(db, id)

    # Update only the fields that were supplied
    if body.locked_price_usd is not None:
        obj.locked_price_usd = body.locked_price_usd
    if body.locked_fx_rate is not None:
        obj.locked_fx_rate = body.locked_fx_rate

    # GBP value: explicit override wins; else compute from price × fx if both known
    if body.locked_value_gbp is not None:
        obj.locked_value_gbp = round(body.locked_value_gbp, 2)
    elif obj.locked_price_usd is not None and obj.locked_fx_rate is not None:
        obj.locked_value_gbp = round(obj.shares * obj.locked_price_usd * obj.locked_fx_rate, 2)

    obj.is_locked = True
    obj.manually_overridden = True
    db.commit()
    db.refresh(obj)
    return obj


@router.post("/vests/lock-historical")
async def lock_all_historical(db: Session = Depends(get_db)):
    n = lock_historical_vests(db)
    return {"locked": n}


@router.post("/vests/{id}/unlock", response_model=RSUVestResponse)
async def unlock_vest(id: int, db: Session = Depends(get_db)):
    try:
        return _db_unlock_vest(db, id)
    except ValueError:
        raise HTTPException(status_code=404, detail="RSU vest not found")
